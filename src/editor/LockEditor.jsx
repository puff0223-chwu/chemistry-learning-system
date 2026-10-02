import { useRef, useState } from 'react'
import RichTextEditor from '../components/RichTextEditor.jsx'
import { assetUrl } from '../lib/assets.js'
import { ANSWER_TYPES, DIAL_CHARSETS, TEXT_OPTIONS_DEFAULT, dialChars, newAnswer } from '../lib/lockLogic.js'
import { DIRECTIONS } from '../lib/missionSchema.js'
import AssetPicker from './AssetPicker.jsx'
import { EventEditor } from './EventEditor.jsx'
import VisibilityBlock from './VisibilityBlock.jsx'

const inputClass = 'w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-sm'
const rid = () => Math.random().toString(36).slice(2, 8)

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-xs text-slate-500">{label}</span>
      {children}
    </label>
  )
}

function Step({ n, title, hint, children }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-bold text-sm">
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-navy text-white text-xs mr-1.5">{n}</span>
        {title}
      </h3>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
      {children}
    </section>
  )
}

const RemoveButton = ({ onClick, disabled, label = '刪除' }) => (
  <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label} className="px-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400">
    ✕
  </button>
)

const AddButton = ({ onClick, children }) => (
  <button type="button" onClick={onClick} className="self-start text-sm bg-slate-100 hover:bg-slate-200 rounded-lg px-3 py-1">
    ＋ {children}
  </button>
)

// ---------------------------------------------------------------- a piece of text and/or a picture

// Used wherever an answer is made of cards: choices, matching, ordering, sorting.
function ItemInput({ item, onChange, assets, placeholder }) {
  const [picking, setPicking] = useState(false)
  const asset = item.assetId ? assets.find((a) => a.id === item.assetId) : null
  return (
    <div className="flex items-center gap-1 flex-1 min-w-0">
      <input value={item.text ?? ''} onChange={(e) => onChange({ ...item, text: e.target.value })} placeholder={placeholder} className={inputClass} />
      <button type="button" onClick={() => setPicking(true)} title={asset ? '換一張圖片' : '加一張圖片（也可以只用文字）'} className="shrink-0 w-9 h-8 rounded-lg border border-slate-300 hover:bg-slate-100 overflow-hidden text-sm flex items-center justify-center">
        {asset ? <img src={assetUrl(asset.storage_path)} alt="" className="w-full h-full object-cover" /> : '🖼️'}
      </button>
      {asset && <RemoveButton label="移除圖片" onClick={() => onChange({ ...item, assetId: null })} />}
      {picking && (
        <AssetPicker
          assets={assets}
          type="image"
          title="選擇圖片"
          onClose={() => setPicking(false)}
          onPick={(a) => {
            onChange({ ...item, assetId: a.id })
            setPicking(false)
          }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------- one editor per answer type
// Each edits `answer` (the shape in lockLogic.newAnswer) and calls onChange(newAnswer).

function TextEditor({ answer, onChange }) {
  const set = (patch) => onChange({ ...answer, ...patch })
  const setOpt = (patch) => set({ options: { ...TEXT_OPTIONS_DEFAULT, ...answer.options, ...patch } })
  const o = { ...TEXT_OPTIONS_DEFAULT, ...answer.options }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-slate-500">可以填多個說法，學生答對其中任何一個就算對（例如「水」「H2O」）。</p>
      {answer.accepted.map((text, i) => (
        <div key={i} className="flex gap-1">
          <input value={text} onChange={(e) => set({ accepted: answer.accepted.map((t, j) => (j === i ? e.target.value : t)) })} placeholder={i === 0 ? '正確答案' : '另一種說法'} className={inputClass} />
          <RemoveButton disabled={answer.accepted.length <= 1} onClick={() => set({ accepted: answer.accepted.filter((_, j) => j !== i) })} />
        </div>
      ))}
      <AddButton onClick={() => set({ accepted: [...answer.accepted, ''] })}>再加一種說法</AddButton>
      <details className="text-sm border border-slate-200 rounded-lg p-2">
        <summary className="cursor-pointer text-slate-600">比對方式（一般不用改）</summary>
        <div className="flex flex-col gap-1 mt-2">
          {[
            ['ignoreCase', '不分大小寫（Nacl = NaCl）'],
            ['fullHalf', '全形半形視為相同（Ａ = A）'],
            ['trim', '忽略前後空白'],
            ['punctuation', '忽略標點符號與空格'],
            ['chemSubscript', '化學式的下標、上標視為相同（H₂O = H2O、Fe³⁺ = Fe3+）'],
          ].map(([key, label]) => (
            <label key={key} className="flex items-start gap-2">
              <input type="checkbox" checked={!!o[key]} onChange={(e) => setOpt({ [key]: e.target.checked })} className="mt-1" />
              {label}
            </label>
          ))}
          <p className="text-xs text-amber-700">⚠️ 化學式的大小寫有差別（Co 鈷、CO 一氧化碳）。答案是化學式又要分大小寫時，請取消「不分大小寫」。</p>
        </div>
      </details>
    </div>
  )
}

function NumberEditor({ answer, onChange }) {
  const set = (patch) => onChange({ ...answer, ...patch })
  const [unitDraft, setUnitDraft] = useState('')
  const addUnit = () => {
    const u = unitDraft.trim()
    if (u && !answer.units.includes(u)) set({ units: [...answer.units, u] })
    setUnitDraft('')
  }
  return (
    <div className="flex flex-col gap-3">
      <Field label="正確的數值">
        <input type="number" step="any" value={answer.value ?? ''} onChange={(e) => set({ value: e.target.value === '' ? null : Number(e.target.value) })} className={inputClass} />
      </Field>
      <Field label="容許誤差（學生的答案在正確值上下這個範圍內都算對）">
        <div className="flex gap-1 items-center">
          <span>±</span>
          <input type="number" min={0} step="any" value={answer.tolerance.amount} onChange={(e) => set({ tolerance: { ...answer.tolerance, amount: Math.max(0, Number(e.target.value) || 0) } })} className={`${inputClass} w-24`} />
          <select value={answer.tolerance.type} onChange={(e) => set({ tolerance: { ...answer.tolerance, type: e.target.value } })} className={inputClass}>
            <option value="abs">數值（例如 ±0.02）</option>
            <option value="pct">百分比（例如 ±5%）</option>
          </select>
        </div>
      </Field>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-slate-500">可接受的單位（沒有單位的題目就不用填）</span>
        <div className="flex flex-wrap gap-1">
          {answer.units.map((u) => (
            <span key={u} className="inline-flex items-center gap-1 bg-slate-100 rounded-full pl-2 pr-1 text-sm">
              {u}
              <RemoveButton label={`移除 ${u}`} onClick={() => set({ units: answer.units.filter((x) => x !== u) })} />
            </span>
          ))}
        </div>
        <div className="flex gap-1">
          <input value={unitDraft} onChange={(e) => setUnitDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addUnit())} placeholder="例如 mol/L　（按 Enter 加入）" className={inputClass} />
          <button type="button" onClick={addUnit} className="bg-slate-100 hover:bg-slate-200 rounded-lg px-3 text-sm">加入</button>
        </div>
        {answer.units.length > 0 && (
          <label className="flex items-center gap-2 text-sm mt-1">
            <input type="checkbox" checked={answer.requireUnit} onChange={(e) => set({ requireUnit: e.target.checked })} /> 學生一定要寫單位
          </label>
        )}
      </div>
    </div>
  )
}

function ChoiceEditor({ answer, onChange, assets, multi }) {
  const set = (patch) => onChange({ ...answer, ...patch })
  const isCorrect = (id) => (multi ? answer.correct.includes(id) : answer.correct === id)
  const toggle = (id) => (multi ? set({ correct: isCorrect(id) ? answer.correct.filter((x) => x !== id) : [...answer.correct, id] }) : set({ correct: id }))
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-slate-500">{multi ? '勾選「所有」正確的選項。' : '點圓圈，選出唯一正確的選項。'}選項可以用文字、圖片，或兩者都用。</p>
      {answer.options.map((opt, i) => (
        <div key={opt.id} className="flex items-center gap-1">
          <input type={multi ? 'checkbox' : 'radio'} name="correct" checked={isCorrect(opt.id)} onChange={() => toggle(opt.id)} title="這個是正確答案" className="shrink-0" />
          <ItemInput item={opt} assets={assets} placeholder={`選項 ${i + 1}`} onChange={(next) => set({ options: answer.options.map((o) => (o.id === opt.id ? next : o)) })} />
          <RemoveButton disabled={answer.options.length <= 2} onClick={() => set({ options: answer.options.filter((o) => o.id !== opt.id), correct: multi ? answer.correct.filter((x) => x !== opt.id) : answer.correct === opt.id ? null : answer.correct })} />
        </div>
      ))}
      <AddButton onClick={() => set({ options: [...answer.options, { id: `op_${rid()}`, text: '', assetId: null }] })}>加一個選項</AddButton>
    </div>
  )
}

function MatchEditor({ answer, onChange, assets }) {
  const set = (pairs) => onChange({ ...answer, pairs })
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-slate-500">每一列填「左邊」和它「對應的右邊」。學生看到時，右邊的順序會被打亂。</p>
      {answer.pairs.map((p, i) => (
        <div key={p.id} className="border border-slate-200 rounded-lg p-2 flex flex-col gap-1">
          <div className="flex items-center gap-1">
            <span className="text-xs text-slate-400 w-4">{i + 1}</span>
            <ItemInput item={p.left} assets={assets} placeholder="左邊" onChange={(next) => set(answer.pairs.map((x) => (x.id === p.id ? { ...x, left: next } : x)))} />
            <RemoveButton disabled={answer.pairs.length <= 2} onClick={() => set(answer.pairs.filter((x) => x.id !== p.id))} />
          </div>
          <div className="flex items-center gap-1 pl-5">
            <span>↔</span>
            <ItemInput item={p.right} assets={assets} placeholder="對應的右邊" onChange={(next) => set(answer.pairs.map((x) => (x.id === p.id ? { ...x, right: next } : x)))} />
          </div>
        </div>
      ))}
      <AddButton onClick={() => set([...answer.pairs, { id: `pr_${rid()}`, left: { text: '', assetId: null }, right: { text: '', assetId: null } }])}>加一組配對</AddButton>
    </div>
  )
}

function OrderEditor({ answer, onChange, assets }) {
  const set = (items) => onChange({ ...answer, items })
  const move = (i, d) => {
    const copy = [...answer.items]
    ;[copy[i], copy[i + d]] = [copy[i + d], copy[i]]
    set(copy)
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-slate-500">請照「正確的順序」由上到下填寫。學生看到時，會自動打亂。</p>
      {answer.items.map((it, i) => (
        <div key={it.id} className="flex items-center gap-1">
          <span className="w-6 h-6 shrink-0 rounded-full bg-navy text-white text-xs flex items-center justify-center">{i + 1}</span>
          <ItemInput item={it} assets={assets} placeholder={`第 ${i + 1} 個步驟`} onChange={(next) => set(answer.items.map((x) => (x.id === it.id ? next : x)))} />
          <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label="往上移" className="px-1 hover:bg-slate-100 rounded disabled:opacity-30">↑</button>
          <button type="button" disabled={i === answer.items.length - 1} onClick={() => move(i, 1)} aria-label="往下移" className="px-1 hover:bg-slate-100 rounded disabled:opacity-30">↓</button>
          <RemoveButton disabled={answer.items.length <= 2} onClick={() => set(answer.items.filter((x) => x.id !== it.id))} />
        </div>
      ))}
      <AddButton onClick={() => set([...answer.items, { id: `op_${rid()}`, text: '', assetId: null }])}>加一個項目</AddButton>
    </div>
  )
}

function CategorizeEditor({ answer, onChange, assets }) {
  const set = (patch) => onChange({ ...answer, ...patch })
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <p className="text-xs font-bold">分類框（學生要把卡片放進去）</p>
        {answer.categories.map((c, i) => (
          <div key={c.id} className="flex gap-1">
            <input value={c.name} onChange={(e) => set({ categories: answer.categories.map((x) => (x.id === c.id ? { ...x, name: e.target.value } : x)) })} placeholder={`分類 ${i + 1}，例如：酸`} className={inputClass} />
            <RemoveButton
              disabled={answer.categories.length <= 2}
              onClick={() => set({ categories: answer.categories.filter((x) => x.id !== c.id), items: answer.items.map((it) => (it.categoryId === c.id ? { ...it, categoryId: null } : it)) })}
            />
          </div>
        ))}
        <AddButton onClick={() => set({ categories: [...answer.categories, { id: `ct_${rid()}`, name: '' }] })}>加一個分類</AddButton>
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="text-xs font-bold">卡片，以及它屬於哪一類</p>
        {answer.items.map((it, i) => (
          <div key={it.id} className="border border-slate-200 rounded-lg p-2 flex flex-col gap-1">
            <div className="flex gap-1">
              <ItemInput item={it} assets={assets} placeholder={`卡片 ${i + 1}，例如：HCl`} onChange={(next) => set({ items: answer.items.map((x) => (x.id === it.id ? { ...next, categoryId: x.categoryId } : x)) })} />
              <RemoveButton onClick={() => set({ items: answer.items.filter((x) => x.id !== it.id) })} />
            </div>
            <select value={it.categoryId ?? ''} onChange={(e) => set({ items: answer.items.map((x) => (x.id === it.id ? { ...x, categoryId: e.target.value || null } : x)) })} className={`${inputClass} ${it.categoryId ? '' : 'border-red-300 bg-red-50'}`}>
              <option value="">（它屬於哪一類？）</option>
              {answer.categories.filter((c) => c.name).map((c) => (
                <option key={c.id} value={c.id}>
                  屬於：{c.name}
                </option>
              ))}
            </select>
          </div>
        ))}
        <AddButton onClick={() => set({ items: [...answer.items, { id: `op_${rid()}`, text: '', assetId: null, categoryId: null }] })}>加一張卡片</AddButton>
      </div>
    </div>
  )
}

// Big drawing window: drag on the picture to mark each correct area.
function HotspotDrawDialog({ answer, asset, onChange, onClose }) {
  const box = useRef(null)
  const [draft, setDraft] = useState(null)
  const norm = (e) => {
    const r = box.current.getBoundingClientRect()
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }
  }
  const start = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    setDraft({ from: norm(e), to: norm(e) })
  }
  const move = (e) => draft && setDraft({ ...draft, to: norm(e) })
  const end = () => {
    if (!draft) return
    const x = Math.min(draft.from.x, draft.to.x)
    const y = Math.min(draft.from.y, draft.to.y)
    const w = Math.abs(draft.from.x - draft.to.x)
    const h = Math.abs(draft.from.y - draft.to.y)
    setDraft(null)
    if (w > 0.01 && h > 0.01) onChange({ ...answer, regions: [...answer.regions, { x, y, w, h }] })
  }
  const rect = (r, extra = '') => ({ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%`, ...(extra ? {} : {}) })
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ backgroundColor: 'rgba(0, 10, 30, 0.7)' }}>
      <div className="bg-white text-navy rounded-2xl p-5 w-full max-w-4xl max-h-[92vh] flex flex-col gap-3 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">🎯 在圖片上畫出「正確的區域」</h2>
          <button type="button" onClick={onClose} className="bg-cyan hover:bg-cyan-dark text-white rounded-lg px-5 py-1.5 font-bold">完成</button>
        </div>
        <p className="text-sm text-slate-600">在圖片上「按住拖曳」畫出一個方框，學生點到框裡就算對。可以畫多個。點方框上的 ✕ 刪除。</p>
        <div className="overflow-auto flex justify-center">
          <div ref={box} className="relative inline-block touch-none select-none cursor-crosshair" onPointerDown={start} onPointerMove={move} onPointerUp={end}>
            <img src={assetUrl(asset.storage_path)} alt="" draggable={false} className="block max-w-full max-h-[62vh]" />
            {answer.regions.map((r, i) => (
              <div key={i} className="absolute border-2 border-emerald-500 bg-emerald-400/30" style={rect(r)}>
                <span className="absolute -top-3 -left-3 w-6 h-6 rounded-full bg-emerald-600 text-white text-xs flex items-center justify-center">{i + 1}</span>
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => onChange({ ...answer, regions: answer.regions.filter((_, j) => j !== i) })}
                  aria-label={`刪除區域 ${i + 1}`}
                  className="absolute -top-3 -right-3 w-6 h-6 rounded-full bg-red-500 text-white text-xs"
                >
                  ✕
                </button>
              </div>
            ))}
            {draft && <div className="absolute border-2 border-dashed border-cyan bg-cyan/20" style={rect({ x: Math.min(draft.from.x, draft.to.x), y: Math.min(draft.from.y, draft.to.y), w: Math.abs(draft.from.x - draft.to.x), h: Math.abs(draft.from.y - draft.to.y) })} />}
          </div>
        </div>
      </div>
    </div>
  )
}

function HotspotEditor({ answer, onChange, assets }) {
  const [picking, setPicking] = useState(false)
  const [drawing, setDrawing] = useState(false)
  const asset = answer.assetId ? assets.find((a) => a.id === answer.assetId) : null
  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={() => setPicking(true)} className="bg-slate-100 hover:bg-slate-200 rounded-lg px-2 py-1.5 text-sm text-left truncate">
        {asset ? `🖼️ ${asset.name || asset.storage_path}` : '選擇題目用的圖片…'}
      </button>
      {asset && (
        <>
          <button type="button" onClick={() => setDrawing(true)} className="relative rounded-xl overflow-hidden border border-slate-300 hover:border-cyan">
            <img src={assetUrl(asset.storage_path)} alt="" className="w-full max-h-40 object-contain bg-slate-100" />
            {answer.regions.map((r, i) => (
              <span key={i} className="absolute border-2 border-emerald-500 bg-emerald-400/30" style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }} />
            ))}
            <span className="absolute bottom-1 right-1 bg-navy/80 text-white text-xs rounded px-2 py-0.5">✏️ 點這裡畫區域</span>
          </button>
          <p className="text-sm">{answer.regions.length === 0 ? <span className="text-red-600">還沒有畫出正確的區域。</span> : `已畫 ${answer.regions.length} 個正確區域。`}</p>
          <div className="flex flex-col gap-1 text-sm">
            {[
              ['any', '學生點中其中一個區域就算對'],
              ['all', '學生要把每個區域都點到才算對（標記數量要剛好）'],
            ].map(([value, label]) => (
              <label key={value} className="flex items-start gap-2">
                <input type="radio" name="hotspot-mode" checked={answer.mode === value} onChange={() => onChange({ ...answer, mode: value })} className="mt-1" />
                {label}
              </label>
            ))}
          </div>
        </>
      )}
      {picking && (
        <AssetPicker
          assets={assets}
          type="image"
          title="選擇題目用的圖片"
          onClose={() => setPicking(false)}
          onPick={(a) => {
            onChange({ ...answer, assetId: a.id, regions: a.id === answer.assetId ? answer.regions : [] })
            setPicking(false)
          }}
        />
      )}
      {drawing && asset && <HotspotDrawDialog answer={answer} asset={asset} onChange={onChange} onClose={() => setDrawing(false)} />}
    </div>
  )
}

function DialEditor({ answer, onChange }) {
  const chars = dialChars(answer)
  // keep the correct combination valid whenever the cells or characters change
  const fit = (patch) => {
    const next = { ...answer, ...patch }
    const c = dialChars(next)
    const value = Array.from({ length: next.cells }, (_, i) => (c.includes(next.value[i]) ? next.value[i] : (c[0] ?? '')))
    onChange({ ...next, value })
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <Field label="有幾格">
          <select value={answer.cells} onChange={(e) => fit({ cells: Number(e.target.value) })} className={inputClass}>
            {[2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n} 格
              </option>
            ))}
          </select>
        </Field>
        <Field label="每一格可以轉出什麼">
          <select value={answer.charset} onChange={(e) => fit({ charset: e.target.value })} className={inputClass}>
            {Object.entries(DIAL_CHARSETS).map(([key, c]) => (
              <option key={key} value={key}>
                {c.label}
              </option>
            ))}
            <option value="custom">自訂（例如元素符號）</option>
          </select>
        </Field>
      </div>
      {answer.charset === 'custom' && (
        <Field label="自訂的字元，用逗號隔開（例如：H, He, Li, Be）">
          <input
            defaultValue={answer.custom.join(', ')}
            onBlur={(e) => fit({ custom: [...new Set(e.target.value.split(/[,，、\s]+/).map((s) => s.trim()).filter(Boolean))] })}
            placeholder="H, He, Li, Be, B, C"
            className={inputClass}
          />
        </Field>
      )}
      <div>
        <p className="text-xs text-slate-500 mb-1">正確的密碼（每一格選一個）</p>
        <div className="flex gap-1 flex-wrap">
          {answer.value.map((v, i) => (
            <select key={i} value={v} onChange={(e) => onChange({ ...answer, value: answer.value.map((x, j) => (j === i ? e.target.value : x)) })} className="bg-navy text-white rounded-lg px-2 py-2 text-lg font-bold">
              {chars.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          ))}
        </div>
      </div>
    </div>
  )
}

const FOUR = DIRECTIONS.filter((d) => ['up', 'down', 'left', 'right'].includes(d.key))

function DirectionEditor({ answer, onChange }) {
  const set = (sequence) => onChange({ ...answer, sequence })
  const arrow = (k) => FOUR.find((d) => d.key === k).arrow
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-slate-500">按方向鍵，依序輸入「正確的方向順序」。</p>
      <div className="min-h-[3rem] rounded-lg bg-navy text-2xl text-white px-3 py-2 flex flex-wrap gap-1.5 items-center">{answer.sequence.length === 0 ? <span className="text-white/50 text-sm">還沒有設定</span> : answer.sequence.map((k, i) => <span key={i}>{arrow(k)}</span>)}</div>
      <div className="flex gap-1 flex-wrap">
        {FOUR.map((d) => (
          <button key={d.key} type="button" onClick={() => set([...answer.sequence, d.key])} aria-label={d.label} className="w-12 h-12 text-2xl rounded-lg bg-slate-100 hover:bg-slate-200">
            {d.arrow}
          </button>
        ))}
        <button type="button" onClick={() => set(answer.sequence.slice(0, -1))} disabled={answer.sequence.length === 0} className="px-3 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-sm">⌫ 刪一個</button>
        <button type="button" onClick={() => set([])} disabled={answer.sequence.length === 0} className="px-3 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-sm">清除</button>
      </div>
    </div>
  )
}

export function AnswerEditor({ lock, onChange, assets }) {
  const common = { answer: lock.answer, onChange, assets }
  switch (lock.answerType) {
    case 'text':
      return <TextEditor {...common} />
    case 'number':
      return <NumberEditor {...common} />
    case 'choice':
      return <ChoiceEditor {...common} />
    case 'multiChoice':
      return <ChoiceEditor {...common} multi />
    case 'match':
      return <MatchEditor {...common} />
    case 'order':
      return <OrderEditor {...common} />
    case 'categorize':
      return <CategorizeEditor {...common} />
    case 'hotspot':
      return <HotspotEditor {...common} />
    case 'dial':
      return <DialEditor {...common} />
    case 'direction':
      return <DirectionEditor {...common} />
    default:
      return null
  }
}

// ---------------------------------------------------------------- the four tabs

const PARTIAL_TYPES = ['match', 'order', 'categorize']

function AskTab({ lock, assets, onChange, onPreview, onWizard }) {
  // Switching the question type keeps what was entered for the old type, so switching back loses nothing.
  function switchType(type) {
    if (type === lock.answerType) return
    const drafts = { ...(lock.answerDrafts ?? {}), [lock.answerType]: lock.answer }
    onChange({ answerType: type, answer: drafts[type] ?? newAnswer(type), answerDrafts: drafts }, { important: true })
  }
  return (
    <div className="flex flex-col gap-5">
      {onWizard && (
        <button type="button" onClick={onWizard} className="bg-violet-50 hover:bg-violet-100 border border-violet-200 text-violet-800 rounded-xl px-3 py-2 text-sm font-bold text-left">
          🧙 用題目精靈，一步一步設定這一題
          <span className="block text-xs font-normal text-violet-700">不知道從哪裡開始？按這裡，我會一題一題問你。</span>
        </button>
      )}
      <Step n={1} title="題目是什麼？" hint="學生打開這一題時，會先看到這段文字。可以放圖片、化學式。">
        <RichTextEditor key={lock.id} value={lock.prompt} onChange={(html) => onChange({ prompt: html }, { key: `prompt-${lock.id}` })} minHeight={110} />
      </Step>

      <Step n={2} title="學生要怎麼回答？">
        <div className="grid grid-cols-2 gap-1.5">
          {ANSWER_TYPES.map((t) => (
            <button
              key={t.type}
              type="button"
              onClick={() => switchType(t.type)}
              className={`text-left rounded-lg border p-2 ${lock.answerType === t.type ? 'border-cyan bg-cyan/10' : 'border-slate-200 hover:bg-slate-50'}`}
            >
              <span className="block text-sm font-bold">
                {t.icon} {t.label}
              </span>
              <span className="block text-[11px] text-slate-500 leading-snug">{t.desc}</span>
            </button>
          ))}
        </div>
      </Step>

      <Step n={3} title="正確答案是什麼？">
        <AnswerEditor lock={lock} assets={assets} onChange={(answer) => onChange({ answer }, { key: `answer-${lock.id}` })} />
      </Step>

      <button type="button" onClick={onPreview} className="bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl px-4 py-2 font-bold">
        ▶ 試答看看（用學生的角度測這一題）
      </button>
    </div>
  )
}

function HelpTab({ lock, onChange }) {
  const hints = [0, 1, 2].map((i) => lock.hints?.[i] ?? '')
  const setHint = (i, text) => onChange({ hints: hints.map((h, j) => (j === i ? text : h)) }, { key: `hint-${lock.id}-${i}` })
  const canFeedback = lock.answerType === 'text' || lock.answerType === 'number'
  const feedback = lock.wrongFeedback ?? []
  return (
    <div className="flex flex-col gap-5">
      <Step n={1} title="💡 提示" hint="由淡到濃，一層比一層明顯。不需要的層留空就好。">
        {[
          ['onWrong', '答錯一次，就自動多給一層提示', '適合練習題。第一次答錯看到提示 1，再錯看到提示 2…'],
          ['onRequest', '學生自己按「提示」才給', '適合解謎、密室逃脫，不想一直被提示打擾。'],
        ].map(([mode, title, desc]) => (
          <label key={mode} className={`flex gap-2 rounded-lg border p-2 cursor-pointer ${lock.hintMode === mode ? 'border-cyan bg-cyan/5' : 'border-slate-200 hover:bg-slate-50'}`}>
            <input type="radio" name={`hintmode-${lock.id}`} checked={lock.hintMode === mode} onChange={() => onChange({ hintMode: mode })} className="mt-1" />
            <span className="text-sm">
              <b>{title}</b>
              <span className="block text-xs text-slate-500">{desc}</span>
            </span>
          </label>
        ))}
        {hints.map((h, i) => (
          <Field key={i} label={`提示 ${i + 1}${i === 0 ? '（比較含蓄）' : i === 2 ? '（幾乎等於告訴答案）' : ''}`}>
            <input value={h} onChange={(e) => setHint(i, e.target.value)} className={inputClass} />
          </Field>
        ))}
      </Step>

      <Step n={2} title="🏳️ 「我真的不會」" hint="學生卡太久時，可以看解析。看完解析不會直接過關，學生必須自己再答對一次，才能繼續劇情。">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!lock.giveUp?.enabled} onChange={(e) => onChange({ giveUp: { ...lock.giveUp, enabled: e.target.checked } })} /> 允許學生按「我真的不會」
        </label>
        {lock.giveUp?.enabled && (
          <>
            <label className="flex items-center gap-2 text-sm">
              答錯
              <select value={lock.giveUp.afterAttempts} onChange={(e) => onChange({ giveUp: { ...lock.giveUp, afterAttempts: Number(e.target.value) } })} className={`${inputClass} w-20`}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              次之後，才出現這個按鈕
            </label>
            <Field label="解析（含完整答案與說明，學生按下去才看得到）">
              <RichTextEditor key={`ex-${lock.id}`} value={lock.explanation} onChange={(html) => onChange({ explanation: html }, { key: `explain-${lock.id}` })} minHeight={90} />
            </Field>
          </>
        )}
      </Step>

      {PARTIAL_TYPES.includes(lock.answerType) && (
        <Step n={3} title="答錯時，要告訴學生對了幾個嗎？">
          {[
            ['all', '不要，只說「還不對」', '學生要自己想辦法。'],
            ['count', '要，告訴他「對了 2／4 個」', '讓學生知道方向，再慢慢調整。'],
          ].map(([mode, title, desc]) => (
            <label key={mode} className={`flex gap-2 rounded-lg border p-2 cursor-pointer ${lock.partialMode === mode ? 'border-cyan bg-cyan/5' : 'border-slate-200 hover:bg-slate-50'}`}>
              <input type="radio" name={`partial-${lock.id}`} checked={lock.partialMode === mode} onChange={() => onChange({ partialMode: mode })} className="mt-1" />
              <span className="text-sm">
                <b>{title}</b>
                <span className="block text-xs text-slate-500">{desc}</span>
              </span>
            </label>
          ))}
        </Step>
      )}

      {canFeedback && (
        <Step n={PARTIAL_TYPES.includes(lock.answerType) ? 4 : 3} title="常見的錯誤答案（選填）" hint="學生打出某個常見的錯誤時，給他針對性的提醒，例如答案寫 0.01 時提醒「單位換算再檢查一次」。">
          {feedback.map((f, i) => (
            <div key={i} className="border border-slate-200 rounded-lg p-2 flex flex-col gap-1">
              <div className="flex gap-1">
                <input value={f.match} onChange={(e) => onChange({ wrongFeedback: feedback.map((x, j) => (j === i ? { ...x, match: e.target.value } : x)) })} placeholder="學生打了這個…" className={inputClass} />
                <RemoveButton onClick={() => onChange({ wrongFeedback: feedback.filter((_, j) => j !== i) })} />
              </div>
              <input value={f.message} onChange={(e) => onChange({ wrongFeedback: feedback.map((x, j) => (j === i ? { ...x, message: e.target.value } : x)) })} placeholder="就顯示這句提醒" className={inputClass} />
            </div>
          ))}
          <AddButton onClick={() => onChange({ wrongFeedback: [...feedback, { match: '', message: '' }] })}>加一個常見錯誤</AddButton>
        </Step>
      )}
    </div>
  )
}

function AfterTab({ lock, ctx, onChange }) {
  const lockCtx = { ...ctx, selfId: lock.id, selfName: lock.name }
  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <h3 className="font-bold text-sm">🎉 學生答對之後，會發生什麼事？</h3>
        <p className="text-xs text-slate-500">例如讓寶物出現、帶學生去下一個場景，或讓他過關。沒有設定的話，答對了也不會有後續。</p>
        <EventEditor actions={lock.onSuccess ?? []} onChange={(v) => onChange({ onSuccess: v }, { key: `onsuccess-${lock.id}` })} ctx={lockCtx} recipeKind="lock" />
        <label className="flex items-center gap-2 text-sm mt-1">
          <input type="checkbox" checked={lock.lockAfterSolved !== false} onChange={(e) => onChange({ lockAfterSolved: e.target.checked })} /> 解開之後，這題不能再作答（會顯示「已經解開了」）
        </label>
      </section>
      <details className="border border-slate-200 rounded-lg p-2">
        <summary className="cursor-pointer text-sm text-slate-600">進階：學生按了「我真的不會」時，另外要發生的事</summary>
        <div className="mt-2">
          <EventEditor actions={lock.onGiveUp ?? []} onChange={(v) => onChange({ onGiveUp: v }, { key: `ongiveup-${lock.id}` })} ctx={lockCtx} />
        </div>
      </details>
    </div>
  )
}

function LookTab({ lock, ctx, onChange, onPickIcon }) {
  const num = (label, key, min) => (
    <Field label={label}>
      <input type="number" min={min} value={Number.isFinite(lock[key]) ? lock[key] : ''} onChange={(e) => e.target.value !== '' && onChange({ [key]: Math.max(min ?? -99999, Number(e.target.value)) }, { key: `prop-${lock.id}-${key}` })} className={inputClass} />
    </Field>
  )
  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2">
        <h3 className="font-bold text-sm">🔒 學生看到的樣子</h3>
        {[
          ['icon', '顯示成一個鎖（或其他圖示）', '學生點它就出題。解開後會變成打開的鎖 🔓。'],
          ['invisible', '隱形，蓋在圖片的某個位置', '例如蓋在保險箱的照片上，學生點照片那個位置就出題。'],
        ].map(([mode, title, desc]) => (
          <label key={mode} className={`flex gap-2 rounded-lg border p-2 cursor-pointer ${lock.appearance === mode ? 'border-cyan bg-cyan/5' : 'border-slate-200 hover:bg-slate-50'}`}>
            <input type="radio" name={`look-${lock.id}`} checked={lock.appearance === mode} onChange={() => onChange({ appearance: mode })} className="mt-1" />
            <span className="text-sm">
              <b>{title}</b>
              <span className="block text-xs text-slate-500">{desc}</span>
            </span>
          </label>
        ))}
        {lock.appearance === 'icon' && (
          <button type="button" onClick={onPickIcon} className="flex items-center gap-3 bg-slate-100 hover:bg-slate-200 rounded-xl px-3 py-2 text-left">
            <span className="text-4xl leading-none">{lock.icon}</span>
            <span className="text-sm">
              <b>更換圖示…</b>
            </span>
          </button>
        )}
      </section>
      <div className="grid grid-cols-2 gap-2">
        {num('X', 'x')}
        {num('Y', 'y')}
        {num('寬', 'w', 12)}
        {num('高', 'h', 12)}
      </div>
      <div className="border-t border-slate-200 pt-3">
        <VisibilityBlock object={lock} ctx={ctx} onUpdate={(id, patch, opts) => onChange(patch, opts)} />
      </div>
    </div>
  )
}

const TABS = [
  { key: 'ask', label: '出題' },
  { key: 'help', label: '提示與解析' },
  { key: 'after', label: '解開後' },
  { key: 'look', label: '外觀' },
]

// Everything about one answer lock, in the order a teacher builds it: question → hints → what happens → look.
export default function LockProperties({ lock, assets, ctx, TabBar, onChange, onPickIcon, onPreview, onWizard }) {
  const [tab, setTab] = useState('ask')
  return (
    <div className="flex flex-col gap-3">
      <Field label="名稱（只有你看得到，方便辨認）　答案鎖">
        <input value={lock.name} onChange={(e) => onChange({ name: e.target.value }, { key: `prop-${lock.id}-name` })} className={inputClass} />
      </Field>
      <TabBar tabs={TABS.map((t) => (t.key === 'after' && lock.onSuccess?.length ? { ...t, badge: '⚡' } : t))} value={tab} onChange={setTab} />
      {tab === 'ask' && <AskTab lock={lock} assets={assets} onChange={onChange} onPreview={onPreview} onWizard={onWizard} />}
      {tab === 'help' && <HelpTab lock={lock} onChange={onChange} />}
      {tab === 'after' && <AfterTab lock={lock} ctx={ctx} onChange={onChange} />}
      {tab === 'look' && <LookTab lock={lock} ctx={ctx} onChange={onChange} onPickIcon={onPickIcon} />}
    </div>
  )
}
