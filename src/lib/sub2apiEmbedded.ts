import type { ApiProfile, AppSettings } from '../types'
import {
  DEFAULT_API_TIMEOUT,
  DEFAULT_IMAGES_MODEL,
  createDefaultOpenAIProfile,
  normalizeSettings,
} from './apiProfiles'
import { normalizeBaseUrl } from './devProxy'

export interface Sub2ApiEmbeddedContext {
  userId: number
  token: string
  sourceOrigin: string
  apiBaseUrl: string
}

export interface Sub2ApiGroup {
  id: number
  name: string
  platform?: string
  status?: string
  allow_image_generation?: boolean
}

export interface Sub2ApiKey {
  id: number
  key: string
  name?: string
  group_id?: number | null
  status?: string
}

export interface Sub2ApiImageGroupOption {
  group: Sub2ApiGroup
  keys: Sub2ApiKey[]
}

export interface Sub2ApiSelectedProfile {
  group: Sub2ApiGroup
  key: Sub2ApiKey
  apiBaseUrl: string
}

export type Sub2ApiBootstrapResult =
  | { status: 'not-embedded' }
  | { status: 'needs-selection'; context: Sub2ApiEmbeddedContext; options: Sub2ApiImageGroupOption[] }
  | { status: 'ready'; profile: Sub2ApiSelectedProfile }
  | { status: 'no-image-group' }
  | { status: 'missing-key'; group?: Sub2ApiGroup }

interface Sub2ApiEnvelope<T> {
  code?: number
  message?: string
  data?: T
}

export function parseSub2ApiEmbeddedContext(searchParams: URLSearchParams): Sub2ApiEmbeddedContext | null {
  if (searchParams.get('ui_mode') !== 'embedded') return null

  const userId = Number(searchParams.get('user_id'))
  const token = searchParams.get('token')?.trim() ?? ''
  const sourceOrigin = normalizeOrigin(searchParams.get('src_host'))

  if (!Number.isSafeInteger(userId) || userId <= 0 || !token || !sourceOrigin) return null

  return {
    userId,
    token,
    sourceOrigin,
    apiBaseUrl: normalizeBaseUrl(`${sourceOrigin}/v1`),
  }
}

export function hasExplicitUrlApiKey(searchParams: URLSearchParams): boolean {
  const apiKey = searchParams.get('apiKey')
  if (apiKey != null && apiKey.trim()) return true

  const settings = parseUrlSettings(searchParams.get('settings'))
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return false

  const record = settings as Record<string, unknown>
  const payload = record.settings && typeof record.settings === 'object' && !Array.isArray(record.settings)
    ? record.settings as Record<string, unknown>
    : record

  if (typeof payload.apiKey === 'string' && payload.apiKey.trim()) return true
  if (!Array.isArray(payload.profiles)) return false

  return payload.profiles.some((profile) =>
    profile &&
    typeof profile === 'object' &&
    typeof (profile as Record<string, unknown>).apiKey === 'string' &&
    Boolean(((profile as Record<string, unknown>).apiKey as string).trim()),
  )
}

export function hasSub2ApiEmbeddedParams(searchParams: URLSearchParams): boolean {
  return ['user_id', 'token', 'theme', 'lang', 'ui_mode', 'src_host', 'src_url'].some((key) => searchParams.has(key))
}

export function clearSub2ApiEmbeddedParams(searchParams: URLSearchParams) {
  for (const key of ['user_id', 'token', 'theme', 'lang', 'ui_mode', 'src_host', 'src_url']) {
    searchParams.delete(key)
  }
}

export function getSub2ApiImageGroupOptions(groups: Sub2ApiGroup[], keys: Sub2ApiKey[]): Sub2ApiImageGroupOption[] {
  const activeKeys = keys.filter((key) => isActiveStatus(key.status) && key.key.trim())
  return groups
    .filter((group) => isActiveStatus(group.status) && group.allow_image_generation === true)
    .map((group) => ({
      group,
      keys: activeKeys.filter((key) => key.group_id === group.id),
    }))
}

export function selectSub2ApiProfile(
  context: Sub2ApiEmbeddedContext,
  options: Sub2ApiImageGroupOption[],
  preferredGroupId?: number | null,
): Sub2ApiBootstrapResult {
  if (!options.length) return { status: 'no-image-group' }

  const preferred = preferredGroupId
    ? options.find((option) => option.group.id === preferredGroupId)
    : undefined

  if (preferred) return optionToBootstrapResult(context, preferred)
  if (options.length === 1) return optionToBootstrapResult(context, options[0])

  return { status: 'needs-selection', context, options }
}

export async function loadSub2ApiBootstrap(
  context: Sub2ApiEmbeddedContext,
  preferredGroupId?: number | null,
  fetchImpl: typeof fetch = fetch,
): Promise<Sub2ApiBootstrapResult> {
  const [groups, keys] = await Promise.all([
    fetchSub2ApiData<Sub2ApiGroup[]>(context, '/api/v1/groups/available', fetchImpl),
    fetchSub2ApiData<Sub2ApiPaginatedItems<Sub2ApiKey> | Sub2ApiKey[]>(
      context,
      '/api/v1/keys?page=1&page_size=1000',
      fetchImpl,
    ),
  ])
  const keyItems = Array.isArray(keys) ? keys : Array.isArray(keys.items) ? keys.items : []
  return selectSub2ApiProfile(context, getSub2ApiImageGroupOptions(groups, keyItems), preferredGroupId)
}

export function applySub2ApiProfile(settings: Partial<AppSettings> | unknown, selected: Sub2ApiSelectedProfile): AppSettings {
  const normalized = normalizeSettings(settings)
  const profile = createSub2ApiProfile(selected, new Set(normalized.profiles.map((item) => item.id)))
  const existing = normalized.profiles.find((item) => getProfileDedupKey(item) === getProfileDedupKey(profile))

  if (existing) {
    return normalizeSettings({
      ...normalized,
      activeProfileId: existing.id,
    })
  }

  const sameIdIndex = normalized.profiles.findIndex((item) => item.id === profile.id)
  const profiles = sameIdIndex >= 0
    ? normalized.profiles.map((item, index) => index === sameIdIndex ? { ...item, ...profile, id: item.id } : item)
    : [...normalized.profiles, profile]

  return normalizeSettings({
    ...normalized,
    profiles,
    activeProfileId: sameIdIndex >= 0 ? normalized.profiles[sameIdIndex].id : profile.id,
  })
}

export function getStoredSub2ApiGroupId(sourceOrigin: string): number | null {
  try {
    const raw = window.localStorage.getItem(getPreferredGroupStorageKey(sourceOrigin))
    const value = Number(raw)
    return Number.isSafeInteger(value) && value > 0 ? value : null
  } catch {
    return null
  }
}

export function storeSub2ApiGroupId(sourceOrigin: string, groupId: number) {
  try {
    window.localStorage.setItem(getPreferredGroupStorageKey(sourceOrigin), String(groupId))
  } catch {
    // Preference storage is best-effort; embedded configuration still works.
  }
}

function optionToBootstrapResult(context: Sub2ApiEmbeddedContext, option: Sub2ApiImageGroupOption): Sub2ApiBootstrapResult {
  const key = option.keys[0]
  if (!key) return { status: 'missing-key', group: option.group }
  return {
    status: 'ready',
    profile: {
      group: option.group,
      key,
      apiBaseUrl: context.apiBaseUrl,
    },
  }
}

async function fetchSub2ApiData<T>(
  context: Sub2ApiEmbeddedContext,
  path: string,
  fetchImpl: typeof fetch,
): Promise<T> {
  const response = await fetchImpl(`${context.sourceOrigin}${path}`, {
    headers: { Authorization: `Bearer ${context.token}` },
  })
  if (!response.ok) {
    throw new Error(`Sub2API request failed: ${response.status}`)
  }

  const payload = await response.json() as Sub2ApiEnvelope<T>
  if (payload && typeof payload === 'object' && 'data' in payload) {
    if (payload.code != null && payload.code !== 0) {
      throw new Error(payload.message || 'Sub2API request failed')
    }
    return payload.data as T
  }

  return payload as T
}

interface Sub2ApiPaginatedItems<T> {
  items?: T[]
}

function createSub2ApiProfile(selected: Sub2ApiSelectedProfile, usedIds: Set<string>): ApiProfile {
  const id = createSub2ApiProfileId(selected.group, selected.apiBaseUrl, usedIds)
  return createDefaultOpenAIProfile({
    id,
    name: `Sub2API - ${selected.group.name || `分组 ${selected.group.id}`}`,
    baseUrl: selected.apiBaseUrl,
    apiKey: selected.key.key,
    model: DEFAULT_IMAGES_MODEL,
    timeout: DEFAULT_API_TIMEOUT,
    apiMode: 'images',
    codexCli: false,
  })
}

function createSub2ApiProfileId(group: Sub2ApiGroup, apiBaseUrl: string, usedIds: Set<string>) {
  const url = new URL(apiBaseUrl)
  const hostSlug = `${url.hostname}-${url.port}`.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase()
  const baseId = `sub2api-${hostSlug || 'host'}-${group.id}`
  if (!usedIds.has(baseId)) return baseId

  let index = 2
  while (usedIds.has(`${baseId}-${index}`)) index += 1
  return `${baseId}-${index}`
}

function getProfileDedupKey(profile: ApiProfile): string {
  return JSON.stringify([
    profile.provider,
    profile.baseUrl.trim().replace(/\/+$/, '').toLowerCase(),
    profile.apiKey.trim(),
    profile.model.trim(),
    profile.apiMode,
  ])
}

function normalizeOrigin(value: string | null): string | null {
  if (!value) return null
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

function isActiveStatus(status: string | undefined): boolean {
  return !status || status === 'active'
}

function parseUrlSettings(raw: string | null): unknown | null {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function getPreferredGroupStorageKey(sourceOrigin: string) {
  return `gpt-image-playground.sub2api.preferred-group.${sourceOrigin}`
}
