import { useState } from 'react'
import { ACTION_TYPES, TRANSITIONS, actionTypeOf, newAction } from '../lib/missionEvents.js'

const inputClass = 'w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-sm'
export const FLAG_LIST_ID = 'mission-flag-suggestions'

// ---------------------------------------------------------------- conditions

function FlagList({ label, hint, value = [], onChange }) {
  const [draft, setDraft] = useState('')
  function add() {
    const name = draft.trim()
    if (name && !value.includes(name)) onChange([...value, name])
    setDraft('')
  }
  return (
    <div>
      <p className="text-xs text-slate-500" title={hint}>
        {label}
      </p>
      <div className="flex flex-wrap gap-1 mb-1">
        {value.map((f) => (
          <span key={f} className="inline-flex items-center gap-1 bg-slate-100 rounded-full pl-2 pr-1 text-xs">
            {f}
            <button type="button" aria-label={`移除 ${f}`} onClick={() => onChange(value.filter((x) => x !== f))} className="w-4 h-4 rounded-full hover:bg-red-100 hover:text-red-700">
              ✕
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-1">
        <input
          list={FLAG_LIST_ID}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
          placeholder="輸入或選擇旗標名稱"
          className={inputClass}
        />
        <button type="button" onClick={add} className="bg-slate-100 hover:bg-slate-200 rounded-lg px-2 text-sm">
          ＋
        </button>
      </div>
    </div>
  )
}

// Edits one condition (spec-v5 §7.2). Empty fields are dropped so the stored JSON stays small.
export function ConditionEditor({ value, onChange }) {
  const c = value ?? {}
  const set = (patch) => {
    const next = { ...c, ...patch }
    for (const k of Object.keys(next)) {
      const v = next[k]
      if (v == null || (Array.isArray(v) && v.length === 0) || v === 0 || v === '') delete next[k]
    }
    onChange(Object.keys(next).length ? next : null)
  }
  return (
    <div className="flex flex-col gap-2 border border-slate-200 rounded-lg p-2 bg-slate-50">
      <FlagList label="這些旗標都要成立" hint="例如「拿到鑰匙」" value={c.allFlags} onChange={(v) => set({ allFlags: v })} />
      <FlagList label="這些旗標至少一個成立" value={c.anyFlags} onChange={(v) => set({ anyFlags: v })} />
      <FlagList label="這些旗標都不能成立" value={c.notFlags} onChange={(v) => set({ notFlags: v })} />
      <label className="flex flex-col gap-0.5">
        <span className="text-xs text-slate-500">遊戲開始超過幾秒才成立（空白＝不限）</span>
        <input
          type="number"
          min={0}
          value={c.elapsedSecondsAtLeast ?? ''}
          onChange={(e) => set({ elapsedSecondsAtLeast: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })}
          className={inputClass}
        />
      </label>
      {!value && <p className="text-[11px] text-slate-400">目前沒有任何限制（永遠成立）。</p>}
    </div>
  )
}

// ---------------------------------------------------------------- actions

function SceneSelect({ scenes, value, onChange }) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} className={inputClass}>
      <option value="">（選擇場景）</option>
      {scenes.map((s) => (
        <option key={s.sceneId} value={s.sceneId}>
          {s.name}
        </option>
      ))}
    </select>
  )
}

function ObjectSelect({ objects, value, onChange }) {
  const groups = Object.entries(
    objects.reduce((acc, o) => {
      ;(acc[o.sceneName] ??= []).push(o)
      return acc
    }, {}),
  )
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} className={inputClass}>
      <option value="">（選擇物件）</option>
      {groups.map(([sceneName, list]) => (
        <optgroup key={sceneName} label={sceneName}>
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

function AssetSelect({ assets, type, value, onChange }) {
  const list = assets.filter((a) => a.type === type)
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} className={inputClass}>
      <option value="">（選擇素材）</option>
      {list.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name || a.storage_path}
        </option>
      ))}
    </select>
  )
}

function ActionParams({ action, onChange, ctx, depth }) {
  const set = (patch) => onChange({ ...action, ...patch })
  switch (actionTypeOf(action)) {
    case 'show_message':
      return <textarea value={action.message} onChange={(e) => set({ message: e.target.value })} rows={2} placeholder="要顯示給學生看的話" className={inputClass} />
    case 'goto_scene':
      return (
        <>
          <SceneSelect scenes={ctx.scenes} value={action.sceneId} onChange={(v) => set({ sceneId: v })} />
          <select value={action.transition ?? ''} onChange={(e) => set({ transition: e.target.value })} className={inputClass}>
            {TRANSITIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </>
      )
    case 'reveal_object':
    case 'hide_object':
      return <ObjectSelect objects={ctx.objects} value={action.target} onChange={(v) => set({ target: v })} />
    case 'set_flag':
    case 'clear_flag':
      return <input list={FLAG_LIST_ID} value={action.flag} onChange={(e) => set({ flag: e.target.value.trim() })} placeholder="旗標名稱，例如「拿到鑰匙」" className={inputClass} />
    case 'swap_background':
      return (
        <>
          <SceneSelect scenes={ctx.scenes} value={action.sceneId} onChange={(v) => set({ sceneId: v })} />
          <AssetSelect assets={ctx.assets} type="image" value={action.assetId} onChange={(v) => set({ assetId: v })} />
        </>
      )
    case 'play_sound':
      return <AssetSelect assets={ctx.assets} type="audio" value={action.assetId} onChange={(v) => set({ assetId: v })} />
    case 'delay':
      return (
        <label className="flex items-center gap-2 text-sm">
          <input type="number" min={0} step={0.5} value={(action.ms ?? 0) / 1000} onChange={(e) => set({ ms: Math.max(0, Number(e.target.value)) * 1000 })} className={`${inputClass} w-24`} />
          秒
        </label>
      )
    case 'complete_stage':
      return <p className="text-xs text-slate-500">學生會過關，並執行「過關後」的事件。</p>
    case 'if':
      return (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-bold">如果…</p>
          <ConditionEditor value={action.if} onChange={(v) => set({ if: v ?? {} })} />
          <p className="text-xs font-bold">就做：</p>
          <EventEditor actions={action.then ?? []} onChange={(v) => set({ then: v })} ctx={ctx} depth={depth + 1} />
          <p className="text-xs font-bold">否則做：</p>
          <EventEditor actions={action.else ?? []} onChange={(v) => set({ else: v })} ctx={ctx} depth={depth + 1} />
        </div>
      )
    default:
      return <p className="text-xs text-slate-500">這個動作（{action.action}）的編輯表單會在後續階段加入，目前保留不動。</p>
  }
}

// Edits a list of event actions as "do this, then this" rows (spec-v5 §7.3): no JSON for the teacher.
// ctx = { scenes, objects: [{id, name, sceneName}], assets }.
export function EventEditor({ actions = [], onChange, ctx, depth = 0 }) {
  const replace = (i, next) => onChange(actions.map((a, j) => (j === i ? next : a)))
  const move = (i, delta) => {
    const copy = [...actions]
    const [item] = copy.splice(i, 1)
    copy.splice(i + delta, 0, item)
    onChange(copy)
  }
  return (
    <div className={`flex flex-col gap-2 ${depth > 0 ? 'ml-2 pl-2 border-l-2 border-cyan/40' : ''}`}>
      {actions.length === 0 && <p className="text-xs text-slate-400">還沒有任何動作。</p>}
      {actions.map((a, i) => (
        <div key={i} className="border border-slate-200 rounded-lg p-2 flex flex-col gap-1.5 bg-white">
          <div className="flex items-center gap-1">
            <span className="text-xs text-slate-400 w-4">{i + 1}.</span>
            <select
              value={actionTypeOf(a)}
              onChange={(e) => replace(i, newAction(e.target.value))}
              className={inputClass}
            >
              {ACTION_TYPES.map((t) => (
                <option key={t.type} value={t.type}>
                  {t.label}
                </option>
              ))}
              {!ACTION_TYPES.some((t) => t.type === actionTypeOf(a)) && <option value={actionTypeOf(a)}>{actionTypeOf(a)}</option>}
            </select>
            <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label="上移" className="px-1 hover:bg-slate-100 rounded disabled:opacity-30">
              ↑
            </button>
            <button type="button" disabled={i === actions.length - 1} onClick={() => move(i, 1)} aria-label="下移" className="px-1 hover:bg-slate-100 rounded disabled:opacity-30">
              ↓
            </button>
            <button type="button" onClick={() => onChange(actions.filter((_, j) => j !== i))} aria-label="刪除動作" className="px-1 hover:bg-red-100 text-red-600 rounded">
              ✕
            </button>
          </div>
          <ActionParams action={a} onChange={(next) => replace(i, next)} ctx={ctx} depth={depth} />
        </div>
      ))}
      <select
        value=""
        onChange={(e) => e.target.value && onChange([...actions, newAction(e.target.value)])}
        className="bg-cyan/10 hover:bg-cyan/20 border border-cyan/40 rounded-lg px-2 py-1 text-sm text-navy"
        aria-label="加入動作"
      >
        <option value="">＋ 加入動作…</option>
        {ACTION_TYPES.map((t) => (
          <option key={t.type} value={t.type}>
            {t.label}
          </option>
        ))}
      </select>
    </div>
  )
}

