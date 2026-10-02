import { useEffect, useLayoutEffect, useRef } from 'react'

// A small right-click menu. items: [{ icon, label, hint, danger, disabled, onClick }, 'sep', null/false (skipped)].
// Stays inside the window, closes on click elsewhere, Esc, scrolling or resizing.
export default function ContextMenu({ x, y, title, items, onClose }) {
  const ref = useRef(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    el.style.left = `${Math.max(4, Math.min(x, window.innerWidth - r.width - 4))}px`
    el.style.top = `${Math.max(4, Math.min(y, window.innerHeight - r.height - 4))}px`
  }, [x, y])

  useEffect(() => {
    const away = (e) => !ref.current?.contains(e.target) && onClose()
    const key = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('mousedown', away, true)
    window.addEventListener('keydown', key)
    window.addEventListener('wheel', onClose, { passive: true })
    window.addEventListener('resize', onClose)
    window.addEventListener('blur', onClose)
    return () => {
      window.removeEventListener('mousedown', away, true)
      window.removeEventListener('keydown', key)
      window.removeEventListener('wheel', onClose)
      window.removeEventListener('resize', onClose)
      window.removeEventListener('blur', onClose)
    }
  }, [onClose])

  // drop empty entries and doubled / leading / trailing separators
  const list = []
  for (const item of items) {
    if (!item) continue
    if (item === 'sep' && (list.length === 0 || list[list.length - 1] === 'sep')) continue
    list.push(item)
  }
  if (list[list.length - 1] === 'sep') list.pop()

  return (
    <div
      ref={ref}
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
      className="fixed z-[60] min-w-[14rem] max-w-[20rem] bg-white text-navy rounded-xl border border-slate-200 shadow-2xl py-1 text-sm"
      style={{ left: x, top: y }}
    >
      {title && <div className="px-3 py-1 text-xs text-slate-400 truncate">{title}</div>}
      {list.map((item, i) =>
        item === 'sep' ? (
          <div key={`s${i}`} className="my-1 border-t border-slate-100" />
        ) : (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              onClose()
              item.onClick?.()
            }}
            className={`w-full flex items-center gap-2 px-3 py-1.5 text-left disabled:opacity-40 ${item.danger ? 'text-red-600 hover:bg-red-50' : 'hover:bg-cyan/10'}`}
          >
            <span className="w-5 text-center shrink-0">{item.icon}</span>
            <span className="flex-1">{item.label}</span>
            {item.hint && <span className="text-xs text-slate-400">{item.hint}</span>}
          </button>
        ),
      )}
    </div>
  )
}
