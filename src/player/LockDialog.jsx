import { useEffect, useMemo, useRef, useState } from 'react'
import RichContent from '../components/RichContent.jsx'
import { assetUrl } from '../lib/assets.js'
import { dialChars, getExplanation, lockView } from '../lib/lockLogic.js'
import { DIRECTIONS } from '../lib/missionSchema.js'

// The student's answer screen for one lock. Every answer type works with taps only (no dragging), so it is the
// same on a tablet, a phone and a mouse. The rules (hints, give-up, checking) live in the GameEngine.

const shuffle = (list) => {
  const copy = [...list]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

const bigInput = 'w-full border-2 border-slate-300 focus:border-cyan outline-none rounded-xl px-4 py-3 text-xl'

// A text and/or picture card, used by choices, matching, ordering and sorting.
// `marker` (a round or square tick box) sits BESIDE the text, never on top of it, so short answers stay readable.
function Item({ item, assets, children, marker, selected, onClick, className = '', disabled }) {
  const asset = item.assetId ? assets[item.assetId] : null
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`relative flex items-center gap-3 text-left rounded-xl border-2 px-4 py-3 text-lg text-navy transition-colors ${selected ? 'border-cyan bg-cyan/10' : 'border-slate-300 bg-white hover:border-cyan/60'} ${className}`}
    >
      {marker}
      <span className="min-w-0 flex-1">
        {asset && <img src={assetUrl(asset.storage_path)} alt={item.text || ''} draggable={false} className="max-h-32 mx-auto mb-1 rounded object-contain" />}
        {item.text && <span className="block break-words">{item.text}</span>}
      </span>
      {children}
    </button>
  )
}

// The little circle (pick one) or box (pick several) in front of an option.
function TickBox({ on, square }) {
  return (
    <span className={`shrink-0 w-6 h-6 border-2 flex items-center justify-center text-sm font-bold ${square ? 'rounded-md' : 'rounded-full'} ${on ? 'border-cyan bg-cyan text-white' : 'border-slate-400 bg-white text-transparent'}`}>
      {square ? '✓' : on ? <span className="w-2.5 h-2.5 rounded-full bg-white" /> : null}
    </span>
  )
}

// ---------------------------------------------------------------- one component per answer type
// Each gets { view, value, onChange, assets, disabled } and keeps `value` in the shape checkAnswer() expects.

function TextAnswer({ value, onChange, onEnter }) {
  return <input autoFocus value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onEnter()} placeholder="在這裡輸入答案" className={bigInput} />
}

function NumberAnswer({ view, value, onChange, onEnter }) {
  return (
    <div className="flex gap-3">
      <input
        autoFocus
        inputMode="decimal"
        value={value.value}
        onChange={(e) => onChange({ ...value, value: e.target.value })}
        onKeyDown={(e) => e.key === 'Enter' && onEnter()}
        placeholder="數值"
        className={bigInput}
      />
      {view.askUnit && <input value={value.unit} onChange={(e) => onChange({ ...value, unit: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && onEnter()} placeholder={view.requireUnit ? '單位（必填）' : '單位'} className={`${bigInput} max-w-[10rem]`} />}
    </div>
  )
}

function ChoiceAnswer({ view, value, onChange, assets, multi }) {
  const toggle = (id) => (multi ? onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]) : onChange(id))
  const isOn = (id) => (multi ? value.includes(id) : value === id)
  return (
    <div className="flex flex-col gap-2">
      {multi && <p className="text-sm text-slate-500">可以選多個</p>}
      {view.options
        .filter((o) => o.text || o.assetId)
        .map((o) => (
          <Item key={o.id} item={o} assets={assets} selected={isOn(o.id)} onClick={() => toggle(o.id)} marker={<TickBox on={isOn(o.id)} square={multi} />} />
        ))}
    </div>
  )
}

function MatchAnswer({ view, value, onChange, assets }) {
  const rights = useMemo(() => shuffle(view.rights), [view.rights])
  const [picked, setPicked] = useState(null) // the left card waiting for a partner
  const partnerOf = (leftId) => value.find((p) => p.left === leftId)?.right
  const ownerOf = (rightId) => value.find((p) => p.right === rightId)?.left
  const number = (leftId) => view.lefts.findIndex((l) => l.id === leftId) + 1

  function tapLeft(id) {
    if (partnerOf(id)) return onChange(value.filter((p) => p.left !== id)) // tap a matched card to undo
    setPicked(picked === id ? null : id)
  }
  function tapRight(id) {
    if (ownerOf(id)) return onChange(value.filter((p) => p.right !== id))
    if (!picked) return
    onChange([...value.filter((p) => p.left !== picked), { left: picked, right: id }])
    setPicked(null)
  }
  return (
    <div>
      <p className="text-sm text-slate-500 mb-2">先點左邊的一張，再點右邊對應的一張。點已配好的可以取消。</p>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2">
        <div className="flex flex-col gap-2">
          {view.lefts.map((l) => (
            <Item key={l.id} item={l} assets={assets} selected={picked === l.id || !!partnerOf(l.id)} onClick={() => tapLeft(l.id)}>
              {partnerOf(l.id) && <span className="absolute -right-3 -top-3 w-7 h-7 rounded-full bg-cyan text-white text-sm font-bold flex items-center justify-center">{number(l.id)}</span>}
            </Item>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          {rights.map((r) => (
            <Item key={r.id} item={r} assets={assets} selected={!!ownerOf(r.id)} onClick={() => tapRight(r.id)}>
              {ownerOf(r.id) && <span className="absolute -left-3 -top-3 w-7 h-7 rounded-full bg-cyan text-white text-sm font-bold flex items-center justify-center">{number(ownerOf(r.id))}</span>}
            </Item>
          ))}
        </div>
      </div>
    </div>
  )
}

function OrderAnswer({ value, onChange, assets, itemsById }) {
  const move = (i, d) => {
    const copy = [...value]
    ;[copy[i], copy[i + d]] = [copy[i + d], copy[i]]
    onChange(copy)
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-slate-500">用右邊的 ▲ ▼ 調整順序，排成正確的先後。</p>
      {value.map((id, i) => (
        <div key={id} className="flex items-center gap-2">
          <span className="w-8 h-8 shrink-0 rounded-full bg-navy text-white font-bold flex items-center justify-center">{i + 1}</span>
          <Item item={itemsById[id]} assets={assets} className="flex-1" onClick={() => {}} />
          <div className="flex flex-col gap-1">
            <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label="往上移" className="w-11 h-9 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-30 text-lg">▲</button>
            <button type="button" disabled={i === value.length - 1} onClick={() => move(i, 1)} aria-label="往下移" className="w-11 h-9 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-30 text-lg">▼</button>
          </div>
        </div>
      ))}
    </div>
  )
}

function CategorizeAnswer({ view, value, onChange, assets }) {
  const [picked, setPicked] = useState(null)
  const loose = view.items.filter((it) => !value[it.id])
  const place = (categoryId) => {
    if (!picked) return
    onChange({ ...value, [picked]: categoryId })
    setPicked(null)
  }
  const back = (itemId) => {
    const { [itemId]: _gone, ...rest } = value
    onChange(rest)
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-slate-500">先點一張卡片，再點它要放進的分類框。點已放好的卡片可以拿回來。</p>
      <div className="flex flex-wrap gap-2 min-h-[3rem] p-2 rounded-xl bg-slate-50 border border-dashed border-slate-300">
        {loose.length === 0 && <span className="text-slate-400 text-sm self-center">卡片都放好了</span>}
        {loose.map((it) => (
          <Item key={it.id} item={it} assets={assets} selected={picked === it.id} onClick={() => setPicked(picked === it.id ? null : it.id)} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {view.categories
          .filter((c) => c.name)
          .map((c) => (
            <div key={c.id} className={`rounded-xl border-2 p-2 min-h-[6rem] ${picked ? 'border-cyan bg-cyan/5 cursor-pointer' : 'border-slate-300'}`} onClick={() => place(c.id)}>
              <p className="font-bold mb-1">{c.name}</p>
              <div className="flex flex-wrap gap-2">
                {view.items
                  .filter((it) => value[it.id] === c.id)
                  .map((it) => (
                    <Item
                      key={it.id}
                      item={it}
                      assets={assets}
                      onClick={(e) => {
                        e.stopPropagation()
                        back(it.id)
                      }}
                    />
                  ))}
              </div>
            </div>
          ))}
      </div>
    </div>
  )
}

function HotspotAnswer({ view, value, onChange, assets }) {
  const asset = assets[view.assetId]
  const max = view.mode === 'all' ? view.regionCount : 1
  const [note, setNote] = useState('')
  function tap(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    const point = { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height }
    if (max === 1) return onChange([point])
    if (value.length >= max) return setNote(`最多只能標 ${max} 個，點已標的記號可以取消。`)
    setNote('')
    onChange([...value, point])
  }
  if (!asset) return <p className="text-slate-500">（這題的圖片找不到）</p>
  return (
    <div>
      <p className="text-sm text-slate-500 mb-2">{max === 1 ? '在圖片上點出你認為正確的位置。' : `在圖片上點出 ${max} 個正確的位置（已標 ${value.length}／${max}）。`}</p>
      <div className="relative inline-block max-w-full select-none">
        <img src={assetUrl(asset.storage_path)} alt="" draggable={false} onClick={tap} className="block max-w-full max-h-[55vh] rounded-xl cursor-crosshair" />
        {value.map((p, i) => (
          <button
            key={i}
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setNote('')
              onChange(value.filter((_, j) => j !== i))
            }}
            aria-label="取消這個標記"
            className="absolute -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-red-500 border-2 border-white text-white font-bold shadow"
            style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
          >
            {max === 1 ? '✕' : i + 1}
          </button>
        ))}
      </div>
      {note && <p className="text-sm text-amber-700 mt-1">{note}</p>}
    </div>
  )
}

function DialAnswer({ view, value, onChange }) {
  const chars = dialChars(view)
  const turn = (i, d) => {
    const at = chars.indexOf(value[i])
    const next = [...value]
    next[i] = chars[(at + d + chars.length) % chars.length]
    onChange(next)
  }
  return (
    <div className="flex justify-center gap-3">
      {value.map((v, i) => (
        <div key={i} className="flex flex-col items-center gap-1">
          <button type="button" onClick={() => turn(i, -1)} aria-label="上一個" className="w-14 h-10 rounded-lg bg-slate-100 hover:bg-slate-200 text-xl">▲</button>
          <div className="min-w-[3.5rem] h-16 px-2 rounded-xl bg-navy text-white text-3xl font-bold flex items-center justify-center">{v}</div>
          <button type="button" onClick={() => turn(i, 1)} aria-label="下一個" className="w-14 h-10 rounded-lg bg-slate-100 hover:bg-slate-200 text-xl">▼</button>
        </div>
      ))}
    </div>
  )
}

const FOUR = DIRECTIONS.filter((d) => ['up', 'down', 'left', 'right'].includes(d.key))

function DirectionAnswer({ value, onChange }) {
  const arrow = (key) => FOUR.find((d) => d.key === key).arrow
  const pad = 'w-16 h-16 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-3xl'
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="min-h-[3.5rem] w-full rounded-xl bg-navy text-3xl px-3 py-2 flex flex-wrap gap-2 items-center justify-center">
        {value.length === 0 ? <span className="text-white/50 text-base">按下面的方向鍵輸入</span> : value.map((k, i) => <span key={i}>{arrow(k)}</span>)}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <span />
        <button type="button" onClick={() => onChange([...value, 'up'])} aria-label="上" className={pad}>⬆️</button>
        <span />
        <button type="button" onClick={() => onChange([...value, 'left'])} aria-label="左" className={pad}>⬅️</button>
        <button type="button" onClick={() => onChange([...value, 'down'])} aria-label="下" className={pad}>⬇️</button>
        <button type="button" onClick={() => onChange([...value, 'right'])} aria-label="右" className={pad}>➡️</button>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={() => onChange(value.slice(0, -1))} disabled={value.length === 0} className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40">⌫ 刪一個</button>
        <button type="button" onClick={() => onChange([])} disabled={value.length === 0} className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40">清除</button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- dialog

function initialValue(lock, view) {
  switch (lock.answerType) {
    case 'text':
      return ''
    case 'number':
      return { value: '', unit: '' }
    case 'choice':
      return null
    case 'multiChoice':
    case 'match':
    case 'hotspot':
    case 'direction':
      return []
    case 'order': {
      let ids = shuffle(view.items.map((i) => i.id))
      // when the stored order is the answer (not yet protected), make sure it does not start solved
      for (let tries = 0; tries < 5 && !lock.sealed && ids.length > 1 && ids.every((id, i) => id === view.items[i].id); tries++) ids = shuffle(ids)
      return ids
    }
    case 'categorize':
      return {}
    case 'dial': {
      const first = dialChars(view)[0]
      return Array.from({ length: view.cells }, () => first)
    }
    default:
      return null
  }
}

function ready(lock, value) {
  switch (lock.answerType) {
    case 'text':
      return value.trim() !== ''
    case 'number':
      return value.value.trim() !== ''
    case 'choice':
      return !!value
    case 'multiChoice':
    case 'match':
    case 'hotspot':
    case 'direction':
      return value.length > 0
    case 'categorize':
      return Object.keys(value).length > 0
    default:
      return true
  }
}

export default function LockDialog({ engine, lockId, assets, state, onClose }) {
  const lock = engine.lockObject(lockId)
  const view = useMemo(() => (lock ? lockView(lock) : null), [lock])
  const [value, setValue] = useState(() => (lock ? initialValue(lock, view) : null))
  const [result, setResult] = useState(null) // the last wrong attempt: { right, total, feedback }
  const [explanation, setExplanation] = useState('')
  const [busy, setBusy] = useState(false)
  const cardRef = useRef(null)

  const st = state.locks[lockId] ?? engine.lockState(lockId)
  const options = lock ? engine.lockOptions(lockId) : null

  // resuming after a refresh: if the student had already given up, show the explanation again
  useEffect(() => {
    if (lock && st.gaveUp && !explanation) getExplanation(lock).then(setExplanation)
  }, [lock, st.gaveUp, explanation])

  if (!lock) return null
  const hints = engine.lockHints(lock).slice(0, st.hints)
  const itemsById = lock.answerType === 'order' ? Object.fromEntries(view.items.map((i) => [i.id, i])) : null

  async function submit() {
    if (busy || !ready(lock, value)) return
    setBusy(true)
    try {
      const res = await engine.submitLock(lockId, value)
      if (!res.correct) {
        setResult(res)
        // shake the card without remounting it (the answer boards keep their state)
        const card = cardRef.current
        if (card) {
          card.classList.remove('lock-shake')
          void card.offsetWidth
          card.classList.add('lock-shake')
        }
      }
    } finally {
      setBusy(false)
    }
  }

  async function giveUp() {
    setBusy(true)
    try {
      setExplanation((await engine.giveUp(lockId)) ?? '')
      setResult(null)
    } finally {
      setBusy(false)
    }
  }

  const common = { view, value, onChange: setValue, assets }
  const answerUi = {
    text: <TextAnswer {...common} onEnter={submit} />,
    number: <NumberAnswer {...common} onEnter={submit} />,
    choice: <ChoiceAnswer {...common} />,
    multiChoice: <ChoiceAnswer {...common} multi />,
    match: <MatchAnswer {...common} />,
    order: <OrderAnswer {...common} itemsById={itemsById} />,
    categorize: <CategorizeAnswer {...common} />,
    hotspot: <HotspotAnswer {...common} />,
    dial: <DialAnswer {...common} />,
    direction: <DirectionAnswer {...common} />,
  }[lock.answerType]

  const partial = result && lock.partialMode === 'count' && result.total > 1
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center px-3 py-3" style={{ backgroundColor: 'rgba(0, 10, 30, 0.7)' }}>
      <div ref={cardRef} className="bg-white text-navy rounded-2xl w-full max-w-3xl max-h-full overflow-y-auto shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 pt-4">
          <h2 className="text-lg font-bold">{st.solved ? '🔓' : '🔒'} {lock.name}</h2>
          <button type="button" onClick={onClose} aria-label="關閉" className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 text-xl">✕</button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {lock.prompt && <RichContent html={lock.prompt} className="text-xl leading-relaxed" />}

          {st.solved ? (
            <p className="text-emerald-700 font-bold text-lg bg-emerald-50 rounded-xl p-3">✅ 這題已經解開了！</p>
          ) : (
            <>
              {explanation && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                  <p className="font-bold text-emerald-800 mb-1">📖 解析</p>
                  <RichContent html={explanation} className="text-lg leading-relaxed" />
                  <p className="text-sm text-emerald-800 mt-2">看完解析後，請自己再作答一次，答對才能繼續。</p>
                </div>
              )}

              {answerUi}

              {result && (
                <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl px-3 py-2">
                  <p className="font-bold">{st.gaveUp ? '再對照一次解析看看。' : '還不對，再想想看 🤔'}</p>
                  {partial && <p>目前對了 {result.right} ／ {result.total} 個，調整一下再送出。</p>}
                  {result.feedback && <p className="mt-1">{result.feedback}</p>}
                </div>
              )}

              {hints.length > 0 && (
                <div className="flex flex-col gap-2">
                  {hints.map((h, i) => (
                    <p key={i} className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-3 py-2">
                      💡 <b>提示 {i + 1}：</b>
                      {h}
                    </p>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <button type="button" disabled={busy || !ready(lock, value)} onClick={submit} className="bg-cyan hover:bg-cyan-dark disabled:opacity-40 text-white rounded-xl px-8 py-3 text-lg font-bold">
                  送出答案
                </button>
                {options.canHint && (
                  <button type="button" onClick={() => engine.requestHint(lockId)} className="bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-xl px-5 py-3 font-bold">
                    💡 {st.hints === 0 ? '給我提示' : '再給一個提示'}
                  </button>
                )}
                {options.canGiveUp && (
                  <button type="button" disabled={busy} onClick={giveUp} className="bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl px-5 py-3 ml-auto">
                    🏳️ 我真的不會
                  </button>
                )}
              </div>
            </>
          )}

          {st.solved && (
            <button type="button" onClick={onClose} className="self-end bg-cyan hover:bg-cyan-dark text-white rounded-xl px-6 py-2 font-bold">
              關閉
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
