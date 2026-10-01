import { useState } from 'react'
import { ACTION_META, TRANSITIONS, actionMeta, actionTypeOf, describeCondition, isEmptyCondition, newAction } from '../lib/missionEvents.js'

const inputClass = 'w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-sm'
// A choice that is still empty gets a red tint, so the teacher sees what is left to fill in.
const required = (value) => (value ? inputClass : `${inputClass} border-red-300 bg-red-50`)

// ---------------------------------------------------------------- 進度記號（flags, in teacher words）

// Pick one progress marker from the ones that exist, or create a new one on the spot.
// Typing free text is deliberately not possible for existing markers: that is how "拿到鑰匙" and "拿到鑰是" happen.
export function FlagPicker({ value, onChange, flags }) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const list = value && !flags.includes(value) ? [...flags, value] : flags

  function confirmNew() {
    const trimmed = name.trim()
    if (trimmed) onChange(trimmed)
    setAdding(false)
    setName('')
  }

  if (adding) {
    return (
      <div className="flex gap-1">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), confirmNew())}
          placeholder="用一句話描述，例如：拿到鑰匙"
          className={inputClass}
        />
        <button type="button" onClick={confirmNew} className="bg-cyan text-white rounded-lg px-2 text-sm whitespace-nowrap">
          確定
        </button>
        <button type="button" onClick={() => setAdding(false)} className="bg-slate-100 rounded-lg px-2 text-sm whitespace-nowrap">
          取消
        </button>
      </div>
    )
  }
  return (
    <select value={value ?? ''} onChange={(e) => (e.target.value === '__new__' ? setAdding(true) : onChange(e.target.value))} className={required(value)}>
      <option value="">（選一件事…）</option>
      {list.map((f) => (
        <option key={f} value={f}>
          {f}
        </option>
      ))}
      <option value="__new__">＋ 新增一件事…</option>
    </select>
  )
}

// ---------------------------------------------------------------- conditions

function CondRow({ icon, label, onRemove, children }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-2 flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold">
          {icon} {label}
        </span>
        <button type="button" onClick={onRemove} aria-label="移除這個條件" title="移除這個條件" className="px-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded">
          ✕
        </button>
      </div>
      {children}
    </div>
  )
}

const ADD_CONDITION = [
  { value: 'has', label: '✅ 學生已經做過某件事' },
  { value: 'not', label: '🚫 學生還沒做過某件事' },
  { value: 'any', label: '🔀 下列其中一件事已經發生' },
  { value: 'time', label: '⏱️ 遊戲開始超過幾秒' },
]

// Edits one condition as a short list of rules that must ALL hold (spec-v5 §7.2), with a plain-language summary
// underneath. `ctx.flags` feeds the marker pickers. Empty fields are dropped so stored JSON stays small.
export function ConditionEditor({ value, onChange, ctx, emptyHint = '目前沒有條件。' }) {
  const c = value ?? {}
  const set = (patch) => {
    const next = { ...c, ...patch }
    for (const k of Object.keys(next)) {
      const v = next[k]
      if (v == null || (Array.isArray(v) && v.length === 0)) delete next[k]
    }
    onChange(Object.keys(next).length ? next : null)
  }
  const all = c.allFlags ?? []
  const none = c.notFlags ?? []
  const any = c.anyFlags ?? []
  const hasTime = c.elapsedSecondsAtLeast !== undefined
  const replaceAt = (list, i, v) => list.map((x, j) => (j === i ? v : x))
  const removeAt = (list, i) => list.filter((_, j) => j !== i)

  function add(kind) {
    if (kind === 'has') set({ allFlags: [...all, ''] })
    if (kind === 'not') set({ notFlags: [...none, ''] })
    if (kind === 'any') set({ anyFlags: [...any, ''] })
    if (kind === 'time') set({ elapsedSecondsAtLeast: 60 })
  }

  const rows = all.length + none.length + (any.length ? 1 : 0) + (hasTime ? 1 : 0)
  return (
    <div className="flex flex-col gap-2 border border-slate-200 rounded-lg p-2 bg-slate-50">
      {rows === 0 && <p className="text-xs text-slate-500">{emptyHint}</p>}
      {rows > 1 && <p className="text-xs text-slate-500">下面每一項都要符合：</p>}

      {all.map((f, i) => (
        <CondRow key={`a${i}`} icon="✅" label="學生已經做過" onRemove={() => set({ allFlags: removeAt(all, i) })}>
          <FlagPicker value={f} flags={ctx.flags} onChange={(v) => set({ allFlags: replaceAt(all, i, v) })} />
        </CondRow>
      ))}
      {none.map((f, i) => (
        <CondRow key={`n${i}`} icon="🚫" label="學生還沒做過" onRemove={() => set({ notFlags: removeAt(none, i) })}>
          <FlagPicker value={f} flags={ctx.flags} onChange={(v) => set({ notFlags: replaceAt(none, i, v) })} />
        </CondRow>
      ))}
      {any.length > 0 && (
        <CondRow icon="🔀" label="下列其中一件已經發生就可以" onRemove={() => set({ anyFlags: null })}>
          {any.map((f, i) => (
            <div key={i} className="flex gap-1 items-center">
              <div className="flex-1">
                <FlagPicker value={f} flags={ctx.flags} onChange={(v) => set({ anyFlags: replaceAt(any, i, v) })} />
              </div>
              <button type="button" aria-label="移除" onClick={() => set({ anyFlags: removeAt(any, i) })} className="px-1 text-slate-400 hover:text-red-600">
                ✕
              </button>
            </div>
          ))}
          <button type="button" onClick={() => set({ anyFlags: [...any, ''] })} className="self-start text-xs text-cyan-dark underline">
            ＋ 再加一件
          </button>
        </CondRow>
      )}
      {hasTime && (
        <CondRow icon="⏱️" label="遊戲開始超過" onRemove={() => set({ elapsedSecondsAtLeast: null })}>
          <label className="flex items-center gap-2 text-sm">
            <input type="number" min={1} value={c.elapsedSecondsAtLeast || ''} onChange={(e) => set({ elapsedSecondsAtLeast: Math.max(1, Number(e.target.value) || 1) })} className={`${inputClass} w-24`} />秒
          </label>
        </CondRow>
      )}

      <select
        value=""
        onChange={(e) => e.target.value && add(e.target.value)}
        aria-label="加一個條件"
        className="bg-white border border-dashed border-cyan/60 hover:bg-cyan/5 rounded-lg px-2 py-1 text-sm text-navy"
      >
        <option value="">＋ 加一個條件…</option>
        {ADD_CONDITION.filter((o) => !((o.value === 'any' && any.length) || (o.value === 'time' && hasTime))).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      {!isEmptyCondition(value) && <p className="text-xs bg-cyan/10 text-navy rounded px-2 py-1">👉 白話：{describeCondition(value)}</p>}
    </div>
  )
}

// ---------------------------------------------------------------- actions

const STRIPE = {
  talk: 'border-l-sky-400',
  move: 'border-l-emerald-500',
  object: 'border-l-orange-400',
  memory: 'border-l-purple-500',
  flow: 'border-l-teal-500',
  goal: 'border-l-amber-500',
  lock: 'border-l-rose-500',
}

function SceneSelect({ scenes, value, onChange }) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} className={required(value)}>
      <option value="">（選一個場景…）</option>
      {scenes.map((s) => (
        <option key={s.sceneId} value={s.sceneId}>
          {s.name}
        </option>
      ))}
    </select>
  )
}

function ObjectSelect({ objects, groups: wholeGroups = [], value, onChange, selfId, selfName }) {
  const groups = Object.entries(
    objects.reduce((acc, o) => {
      ;(acc[o.sceneName] ??= []).push(o)
      return acc
    }, {}),
  )
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} className={required(value)}>
      <option value="">（選一個物件…）</option>
      {selfId && <option value={selfId}>⭐ 這個物件自己（{selfName}）</option>}
      {wholeGroups.length > 0 && (
        <optgroup label="🗂 整個群組（一次處理全部）">
          {wholeGroups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}（場景：{g.sceneName}）
            </option>
          ))}
        </optgroup>
      )}
      {groups.map(([sceneName, list]) => (
        <optgroup key={sceneName} label={`場景：${sceneName}`}>
          {list.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}

function AssetSelect({ assets, type, value, onChange, emptyText }) {
  const list = assets.filter((a) => a.type === type)
  return (
    <div className="flex flex-col gap-0.5">
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} className={required(value)}>
        <option value="">（選一個素材…）</option>
        {list.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name || a.storage_path}
          </option>
        ))}
      </select>
      {list.length === 0 && <span className="text-xs text-amber-700">{emptyText}</span>}
    </div>
  )
}

function Sentence({ children }) {
  return <p className="text-sm text-slate-700">{children}</p>
}

function ActionParams({ action, onChange, ctx, depth }) {
  const set = (patch) => onChange({ ...action, ...patch })
  switch (actionTypeOf(action)) {
    case 'show_message':
      return <textarea value={action.message} onChange={(e) => set({ message: e.target.value })} rows={2} placeholder="寫下學生會看到的話…" className={required(action.message?.trim())} />
    case 'goto_scene':
      return (
        <>
          <SceneSelect scenes={ctx.scenes} value={action.sceneId} onChange={(v) => set({ sceneId: v })} />
          <label className="flex items-center gap-2 text-xs text-slate-500">
            切換效果
            <select value={action.transition ?? ''} onChange={(e) => set({ transition: e.target.value })} className={`${inputClass} flex-1`}>
              {TRANSITIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
        </>
      )
    case 'reveal_object':
    case 'hide_object':
      return <ObjectSelect objects={ctx.objects} groups={ctx.groups} value={action.target} onChange={(v) => set({ target: v })} selfId={ctx.selfId} selfName={ctx.selfName} />
    case 'open_lock':
      return (
        <>
          <ObjectSelect objects={ctx.objects.filter((o) => o.type === 'lock')} value={action.target} onChange={(v) => set({ target: v })} />
          {!ctx.objects.some((o) => o.type === 'lock') && <p className="text-xs text-amber-700">還沒有任何答案鎖。請先用左邊「加入物件」的「🔐 答案鎖」做一題。</p>}
        </>
      )
    case 'set_flag':
    case 'clear_flag':
      return (
        <>
          <FlagPicker value={action.flag} flags={ctx.flags} onChange={(v) => set({ flag: v })} />
          <p className="text-xs text-slate-500">{action.action === 'set_flag' ? '記住之後，其他地方就能問「學生做過這件事了嗎？」來決定要不要讓他通過、讓東西出現。' : '把這件事從「學生做過的事」裡擦掉。'}</p>
        </>
      )
    case 'swap_background':
      return (
        <>
          <Sentence>把這個場景的背景：</Sentence>
          <SceneSelect scenes={ctx.scenes} value={action.sceneId} onChange={(v) => set({ sceneId: v })} />
          <Sentence>換成這張圖：</Sentence>
          <AssetSelect assets={ctx.assets} type="image" value={action.assetId} onChange={(v) => set({ assetId: v })} emptyText="素材庫還沒有圖片，請先上傳。" />
        </>
      )
    case 'play_sound':
      return <AssetSelect assets={ctx.assets} type="audio" value={action.assetId} onChange={(v) => set({ assetId: v })} emptyText="素材庫還沒有音訊（MP3），請先到素材庫上傳。" />
    case 'delay':
      return (
        <label className="flex items-center gap-2 text-sm">
          等待
          <input type="number" min={0} step={0.5} value={(action.ms ?? 0) / 1000} onChange={(e) => set({ ms: Math.max(0, Number(e.target.value)) * 1000 })} className={`${inputClass} w-24`} />
          秒，再做下一件事
        </label>
      )
    case 'complete_stage':
      return <p className="text-xs text-slate-500">學生會過關，接著執行「關卡設定」裡「過關後」的事。</p>
    case 'if':
      return (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-bold text-teal-700">🔎 如果（要先符合這些條件）</p>
          <ConditionEditor value={action.if} onChange={(v) => set({ if: v ?? {} })} ctx={ctx} emptyHint="還沒設條件，目前一定會走「就做」那一邊。" />
          <p className="text-xs font-bold text-emerald-700">✅ 符合的話，就做：</p>
          <EventEditor actions={action.then ?? []} onChange={(v) => set({ then: v })} ctx={ctx} depth={depth + 1} />
          <p className="text-xs font-bold text-rose-700">❌ 不符合的話，就做：（可以留空）</p>
          <EventEditor actions={action.else ?? []} onChange={(v) => set({ else: v })} ctx={ctx} depth={depth + 1} />
        </div>
      )
    default:
      return <p className="text-xs text-slate-500">這個動作（{action.action}）的編輯表單會在後續階段加入，目前保留不動。</p>
  }
}

function ActionRow({ index, count, action, onChange, onMove, onRemove, ctx, depth }) {
  const meta = actionMeta(actionTypeOf(action))
  return (
    <div className={`bg-white border border-slate-200 border-l-4 ${STRIPE[meta?.category] ?? 'border-l-slate-300'} rounded-lg p-2 flex flex-col gap-1.5`}>
      <div className="flex items-center gap-1">
        <span className="text-xs text-slate-400 w-4 shrink-0">{index + 1}</span>
        <span className="flex-1 text-sm font-bold">
          {meta?.icon ?? '❔'} {meta?.label ?? actionTypeOf(action)}
        </span>
        <button type="button" disabled={index === 0} onClick={() => onMove(-1)} title="往前移（先做）" aria-label="往前移" className="px-1.5 hover:bg-slate-100 rounded disabled:opacity-30">
          ↑
        </button>
        <button type="button" disabled={index === count - 1} onClick={() => onMove(1)} title="往後移（後做）" aria-label="往後移" className="px-1.5 hover:bg-slate-100 rounded disabled:opacity-30">
          ↓
        </button>
        <button type="button" onClick={onRemove} title="刪除這一步" aria-label="刪除這一步" className="px-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded">
          ✕
        </button>
      </div>
      <ActionParams action={action} onChange={onChange} ctx={ctx} depth={depth} />
    </div>
  )
}

// ---------------------------------------------------------------- recipes (ready-made starting points)

// Each recipe builds a small list of actions with sensible defaults, so a teacher starts from "撿起它" instead of a blank form.
const RECIPES = {
  object: [
    { icon: '💬', label: '說一句話', desc: '點它就跳出一段話', build: () => [{ action: 'show_message', message: '' }] },
    {
      icon: '📥',
      label: '撿起它',
      desc: '它消失、記住「拿到…」、跳出提示',
      build: (ctx) => [
        { action: 'hide_object', target: ctx.selfId ?? null },
        { action: 'set_flag', flag: `拿到${ctx.selfName ?? '物品'}` },
        { action: 'show_message', message: `你拿到了「${ctx.selfName ?? '物品'}」！` },
      ],
    },
    { icon: '✨', label: '讓別的東西出現', desc: '像是打開抽屜、露出線索', build: () => [{ action: 'reveal_object', target: null }, { action: 'show_message', message: '' }] },
    { icon: '🚶', label: '去別的場景', desc: '當作門或通道', build: () => [{ action: 'goto_scene', sceneId: null, transition: '' }] },
    {
      icon: '🔒',
      label: '需要某件事才行',
      desc: '做過才成功，否則提示',
      build: () => [{ if: {}, then: [{ action: 'show_message', message: '成功了！' }], else: [{ action: 'show_message', message: '好像還缺少什麼…' }] }],
    },
    { icon: '🏁', label: '點到就過關', desc: '學生完成這一關', build: () => [{ action: 'complete_stage' }] },
  ],
  lock: [
    {
      icon: '✨',
      label: '讓寶物出現',
      desc: '答對後，讓一個隱藏的東西現身',
      build: () => [{ action: 'reveal_object', target: null }, { action: 'show_message', message: '答對了！' }],
    },
    { icon: '🚶', label: '帶他去別的場景', desc: '像是打開通往下一間的門', build: () => [{ action: 'show_message', message: '答對了，門開了！' }, { action: 'goto_scene', sceneId: null, transition: '' }] },
    {
      icon: '📌',
      label: '記住「這題解開了」',
      desc: '之後別的地方可以檢查它',
      build: (ctx) => [{ action: 'set_flag', flag: `解開${ctx.selfName ?? '題目'}` }, { action: 'show_message', message: '答對了！' }],
    },
    { icon: '🏁', label: '讓學生過關', desc: '這是最後一題', build: () => [{ action: 'show_message', message: '恭喜答對！' }, { action: 'complete_stage' }] },
  ],
  scene: [
    { icon: '💬', label: '進來就說一句話', desc: '每次進入都會說', build: () => [{ action: 'show_message', message: '' }] },
    {
      icon: '👋',
      label: '只有第一次進來才說',
      desc: '說完記住，之後不再說',
      build: (ctx) => {
        const flag = `去過${ctx.sceneName ?? '這裡'}`
        return [{ if: { notFlags: [flag] }, then: [{ action: 'show_message', message: '' }, { action: 'set_flag', flag }], else: [] }]
      },
    },
  ],
}

function RecipeTiles({ kind, ctx, onPick }) {
  const recipes = RECIPES[kind]
  if (!recipes) return null
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs text-slate-500">不知道從哪開始？選一個常用範例，再修改內容：</p>
      <div className="grid grid-cols-2 gap-1.5">
        {recipes.map((r) => (
          <button key={r.label} type="button" onClick={() => onPick(r.build(ctx))} className="text-left bg-white border border-slate-200 hover:border-cyan hover:bg-cyan/5 rounded-lg p-2">
            <span className="block text-sm font-bold">
              {r.icon} {r.label}
            </span>
            <span className="block text-[11px] text-slate-500 leading-snug">{r.desc}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function AddActionPanel({ onAdd }) {
  const [open, setOpen] = useState(false)
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="bg-cyan/10 hover:bg-cyan/20 border border-cyan/40 text-navy rounded-lg px-3 py-1.5 text-sm font-bold">
        ＋ 接著做…
      </button>
    )
  }
  return (
    <div className="border border-cyan/40 rounded-lg p-2 bg-cyan/5 flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold">接著要做什麼？</span>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-500 hover:text-navy">
          取消
        </button>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {ACTION_META.map((m) => (
          <button
            key={m.type}
            type="button"
            onClick={() => {
              onAdd(newAction(m.type))
              setOpen(false)
            }}
            className={`text-left bg-white border border-slate-200 border-l-4 ${STRIPE[m.category]} hover:bg-slate-50 rounded-lg p-1.5`}
          >
            <span className="block text-sm font-bold">
              {m.icon} {m.label}
            </span>
            <span className="block text-[11px] text-slate-500 leading-snug">{m.desc}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// Edits an event list: "do this, then this" (spec-v5 §7.3). Each step reads as a sentence with its own pickers,
// has a colour by kind of action, and the empty state offers ready-made recipes.
// ctx = { scenes, objects, flags, assets, selfId?, selfName?, sceneName? }; recipeKind = 'object' | 'scene' | undefined.
export function EventEditor({ actions = [], onChange, ctx, depth = 0, recipeKind }) {
  const replace = (i, next) => onChange(actions.map((a, j) => (j === i ? next : a)))
  const move = (i, delta) => {
    const copy = [...actions]
    const [item] = copy.splice(i, 1)
    copy.splice(i + delta, 0, item)
    onChange(copy)
  }
  return (
    <div className={`flex flex-col gap-2 ${depth > 0 ? 'ml-1 pl-2 border-l-2 border-slate-300' : ''}`}>
      {actions.length === 0 && recipeKind && <RecipeTiles kind={recipeKind} ctx={ctx} onPick={onChange} />}
      {actions.length === 0 && !recipeKind && <p className="text-xs text-slate-400">還沒有任何步驟。</p>}
      {actions.length > 1 && <p className="text-xs text-slate-500">會從上往下，一步一步做：</p>}
      {actions.map((a, i) => (
        <ActionRow
          key={i}
          index={i}
          count={actions.length}
          action={a}
          onChange={(next) => replace(i, next)}
          onMove={(d) => move(i, d)}
          onRemove={() => onChange(actions.filter((_, j) => j !== i))}
          ctx={ctx}
          depth={depth}
        />
      ))}
      <AddActionPanel onAdd={(a) => onChange([...actions, a])} />
    </div>
  )
}
