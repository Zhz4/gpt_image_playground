import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_IMAGES_MODEL, DEFAULT_SETTINGS, normalizeSettings } from './apiProfiles'
import {
  applySub2ApiProfile,
  clearSub2ApiEmbeddedParams,
  getSub2ApiImageGroupOptions,
  hasExplicitUrlApiKey,
  hasSub2ApiEmbeddedParams,
  loadSub2ApiBootstrap,
  parseSub2ApiEmbeddedContext,
  selectSub2ApiProfile,
  type Sub2ApiEmbeddedContext,
  type Sub2ApiGroup,
  type Sub2ApiKey,
} from './sub2apiEmbedded'

const context: Sub2ApiEmbeddedContext = {
  userId: 42,
  token: 'jwt-token',
  sourceOrigin: 'https://sub2api.example.com',
  apiBaseUrl: 'https://sub2api.example.com/v1',
}

const imageGroup: Sub2ApiGroup = {
  id: 10,
  name: '生图',
  platform: 'openai',
  status: 'active',
  allow_image_generation: true,
}

const imageKey: Sub2ApiKey = {
  id: 99,
  key: 'sk-image',
  name: 'image key',
  group_id: 10,
  status: 'active',
}

describe('Sub2API embedded bootstrap', () => {
  it('parses embedded query params and derives API base url', () => {
    const params = new URLSearchParams('user_id=42&token=jwt-token&ui_mode=embedded&src_host=https%3A%2F%2Fsub2api.example.com%2Fadmin')

    expect(parseSub2ApiEmbeddedContext(params)).toEqual(context)
  })

  it('returns null outside embedded mode or with missing required params', () => {
    expect(parseSub2ApiEmbeddedContext(new URLSearchParams('user_id=42&token=jwt-token&src_host=https://sub2api.example.com'))).toBeNull()
    expect(parseSub2ApiEmbeddedContext(new URLSearchParams('user_id=42&ui_mode=embedded&src_host=https://sub2api.example.com'))).toBeNull()
  })

  it('filters active image groups and matches active keys by group_id', () => {
    const options = getSub2ApiImageGroupOptions([
      imageGroup,
      { id: 11, name: '文本', status: 'active', allow_image_generation: false },
      { id: 12, name: '停用生图', status: 'inactive', allow_image_generation: true },
    ], [
      imageKey,
      { id: 100, key: 'sk-inactive', group_id: 10, status: 'inactive' },
      { id: 101, key: 'sk-other', group_id: 11, status: 'active' },
    ])

    expect(options).toHaveLength(1)
    expect(options[0].group.id).toBe(10)
    expect(options[0].keys.map((key) => key.key)).toEqual(['sk-image'])
  })

  it('selects a single ready group automatically', () => {
    const result = selectSub2ApiProfile(context, [{ group: imageGroup, keys: [imageKey] }])

    expect(result).toMatchObject({
      status: 'ready',
      profile: {
        group: { id: 10 },
        key: { key: 'sk-image' },
        apiBaseUrl: 'https://sub2api.example.com/v1',
      },
    })
  })

  it('returns needs-selection for multiple image groups without a stored preference', () => {
    const result = selectSub2ApiProfile(context, [
      { group: imageGroup, keys: [imageKey] },
      { group: { ...imageGroup, id: 20, name: '生图 2' }, keys: [{ ...imageKey, id: 200, group_id: 20 }] },
    ])

    expect(result.status).toBe('needs-selection')
  })

  it('uses the stored preference when multiple image groups are available', () => {
    const result = selectSub2ApiProfile(context, [
      { group: imageGroup, keys: [imageKey] },
      { group: { ...imageGroup, id: 20, name: '生图 2' }, keys: [{ ...imageKey, id: 200, key: 'sk-preferred', group_id: 20 }] },
    ], 20)

    expect(result).toMatchObject({
      status: 'ready',
      profile: {
        group: { id: 20 },
        key: { key: 'sk-preferred' },
      },
    })
  })

  it('returns missing-key instead of creating a key', () => {
    const result = selectSub2ApiProfile(context, [{ group: imageGroup, keys: [] }])

    expect(result).toMatchObject({ status: 'missing-key', group: { id: 10 } })
  })

  it('loads Sub2API envelope responses with user JWT', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(init?.headers).toEqual({ Authorization: 'Bearer jwt-token' })
      if (url.endsWith('/api/v1/groups/available')) {
        return new Response(JSON.stringify({ code: 0, message: 'success', data: [imageGroup] }))
      }
      return new Response(JSON.stringify({
        code: 0,
        message: 'success',
        data: { items: [imageKey], total: 1 },
      }))
    }) as unknown as typeof fetch

    const result = await loadSub2ApiBootstrap(context, null, fetchImpl)

    expect(result).toMatchObject({ status: 'ready', profile: { key: { key: 'sk-image' } } })
    expect(fetchImpl).toHaveBeenCalledWith('https://sub2api.example.com/api/v1/groups/available', expect.any(Object))
    expect(fetchImpl).toHaveBeenCalledWith('https://sub2api.example.com/api/v1/keys?page=1&page_size=1000', expect.any(Object))
  })

  it('creates and activates a Sub2API profile without duplicating an existing one', () => {
    const selected = { group: imageGroup, key: imageKey, apiBaseUrl: context.apiBaseUrl }
    const first = applySub2ApiProfile(DEFAULT_SETTINGS, selected)
    const second = applySub2ApiProfile(first, selected)
    const active = normalizeSettings(second).profiles.find((profile) => profile.id === second.activeProfileId)

    expect(second.profiles).toHaveLength(2)
    expect(active).toMatchObject({
      name: 'Sub2API - 生图',
      provider: 'openai',
      baseUrl: 'https://sub2api.example.com/v1',
      apiKey: 'sk-image',
      model: DEFAULT_IMAGES_MODEL,
      apiMode: 'images',
    })
  })

  it('detects and clears embedded params separately from unrelated params', () => {
    const params = new URLSearchParams('ui_mode=embedded&token=jwt&src_host=https://sub2api.example.com&foo=bar')

    expect(hasSub2ApiEmbeddedParams(params)).toBe(true)
    clearSub2ApiEmbeddedParams(params)

    expect(params.toString()).toBe('foo=bar')
  })

  it('detects explicit URL api keys including settings imports', () => {
    expect(hasExplicitUrlApiKey(new URLSearchParams('apiKey=sk-url'))).toBe(true)

    const params = new URLSearchParams()
    params.set('settings', JSON.stringify({ profiles: [{ apiKey: 'sk-imported' }] }))

    expect(hasExplicitUrlApiKey(params)).toBe(true)
    expect(hasExplicitUrlApiKey(new URLSearchParams('model=gpt-image-2'))).toBe(false)
  })
})
