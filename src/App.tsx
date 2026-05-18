import { useEffect, useRef, useState } from 'react'
import { initStore } from './store'
import { useStore } from './store'
import { buildSettingsFromUrlParams, clearUrlSettingParams, hasUrlSettingParams } from './lib/urlSettings'
import {
  applySub2ApiProfile,
  clearSub2ApiEmbeddedParams,
  getStoredSub2ApiGroupId,
  hasExplicitUrlApiKey,
  hasSub2ApiEmbeddedParams,
  loadSub2ApiBootstrap,
  parseSub2ApiEmbeddedContext,
  selectSub2ApiProfile,
  storeSub2ApiGroupId,
  type Sub2ApiEmbeddedContext,
  type Sub2ApiImageGroupOption,
  type Sub2ApiSelectedProfile,
} from './lib/sub2apiEmbedded'
import { useDockerApiUrlMigrationNotice } from './hooks/useDockerApiUrlMigrationNotice'
import Header from './components/Header'
import SearchBar from './components/SearchBar'
import TaskGrid from './components/TaskGrid'
import InputBar from './components/InputBar'
import DetailModal from './components/DetailModal'
import Lightbox from './components/Lightbox'
import SettingsModal from './components/SettingsModal'
import ConfirmDialog from './components/ConfirmDialog'
import Toast from './components/Toast'
import MaskEditorModal from './components/MaskEditorModal'
import ImageContextMenu from './components/ImageContextMenu'
import SupportPromptModal from './components/SupportPromptModal'
import Sub2ApiGroupPicker from './components/Sub2ApiGroupPicker'

const MISSING_SUB2API_IMAGE_KEY_MESSAGE = '没有获取到 API 密钥，请先到 API 密钥中创建一个生图的密钥'

export default function App() {
  const setSettings = useStore((s) => s.setSettings)
  const showToast = useStore((s) => s.showToast)
  const [sub2ApiPicker, setSub2ApiPicker] = useState<{
    context: Sub2ApiEmbeddedContext
    options: Sub2ApiImageGroupOption[]
  } | null>(null)
  const sub2ApiBootstrapStartedRef = useRef(false)
  useDockerApiUrlMigrationNotice()

  const applySelectedSub2ApiProfile = (selected: Sub2ApiSelectedProfile) => {
    setSettings(applySub2ApiProfile(useStore.getState().settings, selected))
    storeSub2ApiGroupId(new URL(selected.apiBaseUrl).origin, selected.group.id)
    showToast(`已使用 Sub2API 生图分组：${selected.group.name || selected.group.id}`, 'success')
  }

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)
    const sub2ApiContext = parseSub2ApiEmbeddedContext(searchParams)
    const shouldSkipSub2ApiBootstrap = hasExplicitUrlApiKey(searchParams)
    const nextSettings = buildSettingsFromUrlParams(useStore.getState().settings, searchParams)

    setSettings(nextSettings)

    if (hasUrlSettingParams(searchParams) || hasSub2ApiEmbeddedParams(searchParams)) {
      clearUrlSettingParams(searchParams)
      clearSub2ApiEmbeddedParams(searchParams)

      const nextSearch = searchParams.toString()
      const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`
      window.history.replaceState(null, '', nextUrl)
    }

    initStore()

    if (!sub2ApiContext || shouldSkipSub2ApiBootstrap || sub2ApiBootstrapStartedRef.current) return
    sub2ApiBootstrapStartedRef.current = true

    void loadSub2ApiBootstrap(sub2ApiContext, getStoredSub2ApiGroupId(sub2ApiContext.sourceOrigin))
      .then((result) => {
        if (result.status === 'ready') {
          applySelectedSub2ApiProfile(result.profile)
          return
        }
        if (result.status === 'needs-selection') {
          setSub2ApiPicker({ context: result.context, options: result.options })
          return
        }
        if (result.status === 'no-image-group') {
          showToast('当前账号暂无可用生图分组', 'error')
          return
        }
        if (result.status === 'missing-key') {
          showToast(MISSING_SUB2API_IMAGE_KEY_MESSAGE, 'error')
        }
      })
      .catch(() => {
        showToast('无法读取 Sub2API 用户配置，请检查登录状态或跨域配置', 'error')
      })
  }, [setSettings, showToast])

  const handleSelectSub2ApiGroup = (option: Sub2ApiImageGroupOption) => {
    if (!sub2ApiPicker) return
    storeSub2ApiGroupId(sub2ApiPicker.context.sourceOrigin, option.group.id)
    const result = selectSub2ApiProfile(sub2ApiPicker.context, [option], option.group.id)
    setSub2ApiPicker(null)

    if (result.status === 'ready') {
      applySelectedSub2ApiProfile(result.profile)
      return
    }

    showToast(MISSING_SUB2API_IMAGE_KEY_MESSAGE, 'error')
  }

  useEffect(() => {
    const preventPageImageDrag = (e: DragEvent) => {
      if ((e.target as HTMLElement | null)?.closest('img')) {
        e.preventDefault()
      }
    }

    document.addEventListener('dragstart', preventPageImageDrag)
    return () => document.removeEventListener('dragstart', preventPageImageDrag)
  }, [])

  return (
    <>
      <Header />
      <main data-home-main data-drag-select-surface className="pb-48">
        <div className="safe-area-x max-w-7xl mx-auto">
          <SearchBar />
          <TaskGrid />
        </div>
      </main>
      <InputBar />
      <DetailModal />
      <Lightbox />
      <SettingsModal />
      <ConfirmDialog />
      <SupportPromptModal />
      <Toast />
      <MaskEditorModal />
      <ImageContextMenu />
      <Sub2ApiGroupPicker
        context={sub2ApiPicker?.context ?? null}
        options={sub2ApiPicker?.options ?? []}
        onSelect={handleSelectSub2ApiGroup}
        onClose={() => setSub2ApiPicker(null)}
      />
    </>
  )
}
