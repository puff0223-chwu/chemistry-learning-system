import { useMemo, useState } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'

export default function MathDialog({ initialLatex = '', initialDisplay = false, onInsert, onCancel }) {
  const [latex, setLatex] = useState(initialLatex)
  const [display, setDisplay] = useState(initialDisplay)

  const preview = useMemo(() => {
    if (!latex.trim()) return { html: '', error: null }
    try {
      return { html: katex.renderToString(latex, { displayMode: display, throwOnError: true }), error: null }
    } catch (err) {
      return { html: '', error: err.message.replace(/^KaTeX parse error: /, '') }
    }
  }, [latex, display])

  const canInsert = latex.trim() && !preview.error

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center px-4"
      style={{ backgroundColor: 'rgba(0, 10, 30, 0.6)' }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="bg-white text-navy rounded-2xl p-6 w-full max-w-lg flex flex-col gap-4 shadow-xl">
        <h3 className="text-lg font-bold">插入數學式</h3>
        <textarea
          autoFocus
          value={latex}
          onChange={(e) => setLatex(e.target.value)}
          placeholder="例如 pH = -\log[H^+]"
          rows={3}
          className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 font-mono text-sm"
        />
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={display} onChange={(e) => setDisplay(e.target.checked)} />
          獨立一行顯示（儲存為 $$…$$）
        </label>
        <div className="min-h-[64px] rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 overflow-x-auto flex items-center">
          {preview.error ? (
            <p className="text-red-600 text-sm">語法錯誤：{preview.error}</p>
          ) : preview.html ? (
            <div dangerouslySetInnerHTML={{ __html: preview.html }} />
          ) : (
            <p className="text-slate-400 text-sm">預覽會顯示在這裡</p>
          )}
        </div>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="bg-slate-100 hover:bg-slate-200 rounded-xl px-4 py-2">
            取消
          </button>
          <button
            type="button"
            disabled={!canInsert}
            onClick={() => onInsert(latex.trim(), display)}
            className="bg-cyan hover:bg-cyan-dark disabled:opacity-40 text-white rounded-xl px-4 py-2 font-bold"
          >
            插入
          </button>
        </div>
      </div>
    </div>
  )
}
