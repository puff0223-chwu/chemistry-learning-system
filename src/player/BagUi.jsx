import { useEffect, useRef, useState } from 'react'
import ItemFace from '../components/ItemFace.jsx'

// Short messages that appear and fade by themselves ("撿到了「鑰匙」"); they never block the game.
export function Toasts({ items }) {
  if (items.length === 0) return null
  return (
    <div className="absolute left-0 right-0 bottom-28 z-40 flex flex-col items-center gap-1.5 pointer-events-none px-4">
      {items.map((t) => (
        <div key={t.id} className="bg-black/80 text-white rounded-full px-5 py-2 text-base shadow-lg max-w-full text-center">
          {t.text}
        </div>
      ))}
    </div>
  )
}

// The big look at one item: a larger picture, its name and the description the teacher wrote.
export function ItemViewDialog({ item, assets, onClose }) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center px-4" style={{ backgroundColor: 'rgba(0, 10, 30, 0.8)' }} onClick={onClose}>
      <div className="bg-white text-navy rounded-2xl p-6 w-full max-w-md flex flex-col items-center gap-3 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="w-48 h-48 flex items-center justify-center bg-slate-100 rounded-xl overflow-hidden">
          <ItemFace item={item} assetMap={assets} size="text-[7rem]" />
        </div>
        <h2 className="text-xl font-bold">{item.name || '物品'}</h2>
        <p className="text-slate-600 text-center leading-relaxed min-h-[1.5rem]">{item.description?.trim() || '（沒有特別的說明）'}</p>
        <button type="button" onClick={onClose} className="bg-cyan hover:bg-cyan-dark text-white rounded-xl px-6 py-2 font-bold">
          知道了
        </button>
      </div>
    </div>
  )
}

// The evidence bag: a strip of item cards along the bottom. Tap a card to hold the item (then tap a socket, or another
// item to try combining them), or drag it onto a socket / another card. Pointer events serve mouse and touch alike.
export function BagDrawer({ engine, bag, assets, held, setHeld, onView, onClose, blocked }) {
  const [ghost, setGhost] = useState(null) // { item, x, y } while a card is being dragged
  const drag = useRef(null)
  const latest = useRef(null)
  useEffect(() => {
    latest.current = { engine, held, setHeld, blocked }
  })

  useEffect(() => {
    function move(e) {
      const d = drag.current
      if (!d) return
      if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 8) d.moved = true
      if (d.moved) setGhost({ item: d.item, x: e.clientX, y: e.clientY })
    }
    function up(e) {
      const d = drag.current
      if (!d) return
      drag.current = null
      setGhost(null)
      const { engine: eng, held: now, setHeld: hold, blocked: stuck } = latest.current
      if (stuck) return
      if (!d.moved) {
        // a tap: with something in hand, another card means "try to combine"; otherwise pick up / put down
        if (now && now !== d.item.itemId) {
          hold(null)
          eng.combineItems(now, d.item.itemId)
        } else hold(now === d.item.itemId ? null : d.item.itemId)
        return
      }
      const target = document.elementFromPoint(e.clientX, e.clientY)
      const socket = target?.closest?.('[data-socket-id]')
      const card = target?.closest?.('[data-bag-item]')
      if (socket) {
        hold(null)
        eng.useItemOnSocket(socket.dataset.socketId, d.item.itemId)
      } else if (card && card.dataset.bagItem !== d.item.itemId) {
        hold(null)
        eng.combineItems(d.item.itemId, card.dataset.bagItem)
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [])

  const heldItem = bag.find((i) => i.itemId === held)
  return (
    <div className="absolute left-0 right-0 bottom-0 z-40 bg-slate-900/92 text-white border-t border-white/20 px-3 pt-2 pb-3 flex flex-col gap-2" style={{ backgroundColor: 'rgba(15, 23, 42, 0.94)' }}>
      <div className="flex items-center gap-2 text-sm">
        <b>🎒 證物袋（{bag.length}）</b>
        <span className="text-white/70 flex-1 min-w-0 truncate">
          {heldItem ? `手上拿著「${heldItem.name}」：點場景裡的插座放進去，或點另一個物品試試組合` : bag.length === 0 ? '還沒有物品。去場景裡找找看。' : '點物品拿起來；也可以拖到插座，或拖到另一個物品上組合。'}
        </span>
        {heldItem && (
          <>
            <button type="button" onClick={() => onView(heldItem)} className="bg-white/15 hover:bg-white/25 rounded-lg px-3 py-1">
              🔍 檢視
            </button>
            <button type="button" onClick={() => setHeld(null)} className="bg-white/15 hover:bg-white/25 rounded-lg px-3 py-1">
              放下
            </button>
          </>
        )}
        <button type="button" onClick={onClose} className="bg-white/15 hover:bg-white/25 rounded-lg px-3 py-1">
          收起
        </button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 min-h-[5.5rem]">
        {bag.map((item) => (
          <div
            key={item.itemId}
            data-bag-item={item.itemId}
            onPointerDown={(e) => {
              if (e.button > 0) return
              e.preventDefault()
              drag.current = { item, sx: e.clientX, sy: e.clientY, moved: false }
            }}
            onDoubleClick={() => onView(item)}
            style={{ touchAction: 'none' }}
            title={`${item.name}（點一下拿起來，拖到插座或另一個物品上，雙擊檢視）`}
            className={`shrink-0 w-24 flex flex-col items-center gap-1 rounded-xl p-2 cursor-grab select-none ${held === item.itemId ? 'bg-cyan/40 ring-2 ring-cyan' : 'bg-white/10 hover:bg-white/20'}`}
          >
            <div className="w-14 h-14 flex items-center justify-center overflow-hidden">
              <ItemFace item={item} assetMap={assets} size="text-4xl" />
            </div>
            <span className="text-xs text-center leading-tight line-clamp-2">{item.name}</span>
          </div>
        ))}
      </div>
      {ghost && (
        <div className="fixed z-[70] pointer-events-none w-16 h-16 flex items-center justify-center rounded-xl bg-white/80 shadow-xl" style={{ left: ghost.x - 32, top: ghost.y - 32 }}>
          <ItemFace item={ghost.item} assetMap={assets} size="text-4xl" />
        </div>
      )}
    </div>
  )
}
