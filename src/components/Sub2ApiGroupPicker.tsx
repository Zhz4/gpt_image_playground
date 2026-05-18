import type { Sub2ApiEmbeddedContext, Sub2ApiImageGroupOption } from '../lib/sub2apiEmbedded'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape'
import { usePreventBackgroundScroll } from '../hooks/usePreventBackgroundScroll'

interface Sub2ApiGroupPickerProps {
  context: Sub2ApiEmbeddedContext | null
  options: Sub2ApiImageGroupOption[]
  onSelect: (option: Sub2ApiImageGroupOption) => void
  onClose: () => void
}

export default function Sub2ApiGroupPicker({ context, options, onSelect, onClose }: Sub2ApiGroupPickerProps) {
  const open = Boolean(context && options.length > 1)

  useCloseOnEscape(open, onClose)
  usePreventBackgroundScroll(open)

  if (!open) return null

  return (
    <div
      data-no-drag-select
      className="fixed inset-0 z-[115] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/20 dark:bg-black/40 backdrop-blur-md animate-overlay-in" />
      <div
        className="relative z-10 w-full max-w-lg rounded-2xl border border-white/50 bg-white/95 p-5 shadow-[0_8px_40px_rgb(0,0,0,0.12)] ring-1 ring-black/5 animate-confirm-in dark:border-white/[0.08] dark:bg-gray-900/95 dark:shadow-[0_8px_40px_rgb(0,0,0,0.4)] dark:ring-white/10"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">选择生图分组</h2>
          <p className="mt-1 text-sm leading-5 text-gray-500 dark:text-gray-400">
            当前账号有多个可用的 Sub2API 生图分组，请选择本次使用的 API Key 来源。
          </p>
        </div>

        <div className="space-y-2">
          {options.map((option) => {
            const hasKey = option.keys.length > 0
            return (
              <button
                key={option.group.id}
                type="button"
                onClick={() => onSelect(option)}
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-3 text-left transition hover:border-blue-300 hover:bg-blue-50/70 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/[0.08] dark:bg-white/[0.03] dark:hover:border-blue-500/40 dark:hover:bg-blue-500/10"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                    {option.group.name || `分组 ${option.group.id}`}
                  </span>
                  <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                    {option.group.platform || 'Sub2API'} · {hasKey ? `${option.keys.length} 个可用 Key` : '没有可用 Key'}
                  </span>
                </span>
                <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${
                  hasKey
                    ? 'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-300'
                    : 'bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300'
                }`}>
                  {hasKey ? '可用' : '需创建 Key'}
                </span>
              </button>
            )
          })}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 dark:border-white/[0.08] dark:text-gray-300 dark:hover:bg-white/[0.06]"
          >
            稍后再说
          </button>
        </div>
      </div>
    </div>
  )
}
