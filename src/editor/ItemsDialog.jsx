import { useState } from 'react'
import ItemFace from '../components/ItemFace.jsx'
import AssetPicker from './AssetPicker.jsx'
import IconPicker from './IconPicker.jsx'

const inputClass = 'w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-sm'

// The mission's list of items (things a student can pick up and carry in the evidence bag) and the recipes that
// combine two items into a new one. Items are created here first, then chosen wherever they are used.
export default function ItemsDialog({ items, combinations, showBag, assets, assetMap, onItems, onCombinations, onAddItem, onDeleteItem, onShowBag, onClose }) {
  const [iconFor, setIconFor] = useState(null) // item id whose icon is being chosen
  const [imageFor, setImageFor] = useState(null)
  const patchItem = (id, patch, key) => onItems(items.map((it) => (it.itemId === id ? { ...it, ...patch } : it)), key ? { key: `item-${id}-${key}` } : undefined)
  const patchCombo = (id, patch, key) => onCombinations(combinations.map((c) => (c.id === id ? { ...c, ...patch } : c)), key ? { key: `combo-${id}-${key}` } : undefined)
  const itemOptions = () => (
    <>
      <option value="">（選物品…）</option>
      {items.map((it) => (
        <option key={it.itemId} value={it.itemId}>
          {it.icon} {it.name || '（未命名）'}
        </option>
      ))}
    </>
  )
  const req = (v) => (v ? inputClass : `${inputClass} border-red-400 bg-red-50`)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ backgroundColor: 'rgba(0, 10, 30, 0.6)' }}>
      <div className="bg-white text-navy rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
          <h2 className="text-lg font-bold">🎒 物品清單</h2>
          <button type="button" onClick={onClose} className="bg-cyan hover:bg-cyan-dark text-white rounded-lg px-4 py-1.5 font-bold">
            完成
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4 flex flex-col gap-5">
          <p className="text-sm text-slate-600 leading-relaxed">
            物品是學生可以收進「證物袋」、之後拿去用的東西（鑰匙、試管、證物…）。<b>先在這裡建立物品</b>，再到場景裡設定「哪個東西可以撿起來」、「哪個插座接受它」。
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={showBag !== false} onChange={(e) => onShowBag(e.target.checked)} />
            在學生畫面上顯示「🎒 證物袋」按鈕（沒有用到物品的任務可以關掉）
          </label>

          <section className="flex flex-col gap-2">
            <h3 className="font-bold">物品（{items.length}）</h3>
            {items.length === 0 && (
              <div className="bg-slate-50 rounded-lg p-4 text-sm text-slate-500">
                還沒有物品。例如：「鑰匙」「空試管」「指紋卡」。按下面「＋ 新增物品」開始。
              </div>
            )}
            {items.map((it) => (
              <div key={it.itemId} className="border border-slate-200 rounded-xl p-2.5 flex gap-2.5 items-start">
                <div className="flex flex-col gap-1 shrink-0 items-center">
                  <button type="button" onClick={() => (it.assetId ? setImageFor(it.itemId) : setIconFor(it.itemId))} title="換圖示" className="w-14 h-14 rounded-lg border border-slate-300 hover:border-cyan flex items-center justify-center overflow-hidden bg-slate-50">
                    <ItemFace item={it} assetMap={assetMap} size="text-3xl" />
                  </button>
                  <div className="flex gap-1 text-[11px]">
                    <button type="button" onClick={() => setIconFor(it.itemId)} className="underline text-slate-600 hover:text-navy">
                      圖示
                    </button>
                    <button type="button" onClick={() => setImageFor(it.itemId)} className="underline text-slate-600 hover:text-navy">
                      圖片
                    </button>
                  </div>
                  {it.assetId && (
                    <button type="button" onClick={() => patchItem(it.itemId, { assetId: null })} className="text-[11px] underline text-slate-500 hover:text-red-600">
                      不用圖片
                    </button>
                  )}
                </div>
                <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                  <input value={it.name} onChange={(e) => patchItem(it.itemId, { name: e.target.value }, 'name')} placeholder="物品名稱（必填），例如：鑰匙" className={req(it.name?.trim())} />
                  <input value={it.description ?? ''} onChange={(e) => patchItem(it.itemId, { description: e.target.value }, 'desc')} placeholder="學生點開「檢視」時看到的說明（可不填），例如：一把生鏽的小鑰匙" className={inputClass} />
                </div>
                <button type="button" onClick={() => onDeleteItem(it.itemId)} title="刪除這個物品" aria-label={`刪除物品 ${it.name}`} className="px-1.5 py-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded">
                  ✕
                </button>
              </div>
            ))}
            <button type="button" onClick={() => onAddItem()} className="self-start bg-cyan/10 hover:bg-cyan/20 border border-cyan/40 rounded-lg px-3 py-1.5 text-sm font-bold">
              ＋ 新增物品
            </button>
            <p className="text-xs text-slate-500">刪除物品時，用到它的「組合」會一起刪掉；場景裡還指向它的地方，發布前檢查會提醒你重新選。</p>
          </section>

          <section className="flex flex-col gap-2 border-t border-slate-200 pt-4">
            <h3 className="font-bold">🧪 物品組合（{combinations.length}）</h3>
            <p className="text-xs text-slate-500">學生在證物袋裡把兩個物品拖在一起，兩個都會用掉，變成一個新物品。例如「空試管＋試劑＝裝好試劑的試管」。</p>
            {combinations.map((c) => (
              <div key={c.id} className="border border-slate-200 rounded-xl p-2.5 flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5">
                  <select value={c.a ?? ''} onChange={(e) => patchCombo(c.id, { a: e.target.value })} className={req(c.a)}>
                    {itemOptions(c.a)}
                  </select>
                  <span className="font-bold">＋</span>
                  <select value={c.b ?? ''} onChange={(e) => patchCombo(c.id, { b: e.target.value })} className={req(c.b)}>
                    {itemOptions(c.b)}
                  </select>
                  <span className="font-bold">＝</span>
                  <select value={c.result ?? ''} onChange={(e) => patchCombo(c.id, { result: e.target.value })} className={req(c.result)}>
                    {itemOptions(c.result)}
                  </select>
                  <button type="button" onClick={() => onCombinations(combinations.filter((x) => x.id !== c.id))} title="刪除這個組合" aria-label="刪除這個組合" className="px-1.5 py-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded">
                    ✕
                  </button>
                </div>
                <input value={c.message ?? ''} onChange={(e) => patchCombo(c.id, { message: e.target.value }, 'msg')} placeholder="組合成功時學生看到的話（可不填），例如：把試劑倒進試管" className={inputClass} />
              </div>
            ))}
            <button
              type="button"
              disabled={items.length < 3}
              onClick={() => onCombinations([...combinations, { id: `cb_${Math.random().toString(36).slice(2, 8)}`, a: '', b: '', result: '', message: '' }])}
              className="self-start bg-cyan/10 hover:bg-cyan/20 disabled:opacity-40 border border-cyan/40 rounded-lg px-3 py-1.5 text-sm font-bold"
            >
              ＋ 新增組合
            </button>
            {items.length < 3 && <p className="text-xs text-slate-500">組合需要至少三個物品（兩個材料和一個結果）。先在上面建立好物品。</p>}
          </section>
        </div>
      </div>

      {iconFor && <IconPicker current={items.find((i) => i.itemId === iconFor)?.icon} onPick={(emoji) => (patchItem(iconFor, { icon: emoji, assetId: null }), setIconFor(null))} onClose={() => setIconFor(null)} />}
      {imageFor && (
        <AssetPicker
          assets={assets}
          type="image"
          title="選擇物品的圖片"
          onClose={() => setImageFor(null)}
          onPick={(a) => {
            patchItem(imageFor, { assetId: a.id })
            setImageFor(null)
          }}
        />
      )}
    </div>
  )
}
