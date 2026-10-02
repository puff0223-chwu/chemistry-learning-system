import { useState } from 'react'
import RichTextEditor from '../components/RichTextEditor.jsx'
import { genId } from '../lib/missionSchema.js'
import { ConditionEditor, EventEditor } from './EventEditor.jsx'

const inputClass = 'w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-sm'

function Block({ number, title, hint, children }) {
  return (
    <section className="flex flex-col gap-2 border border-slate-200 rounded-xl p-3">
      <h3 className="font-bold">
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-navy text-white text-sm mr-2">{number}</span>
        {title}
      </h3>
      {hint && <p className="text-sm text-slate-500">{hint}</p>}
      {children}
    </section>
  )
}

// ---------------------------------------------------------------- 任務目標 (objectives)

const newObjective = () => ({ objectiveId: genId('og'), text: '', visibleWhen: null, doneWhen: null, hints: ['', '', ''], onDone: [], hidden: false })

function Radio({ name, checked, onChange, title, desc }) {
  return (
    <label className={`flex gap-2 rounded-lg border p-2 cursor-pointer ${checked ? 'border-cyan bg-cyan/5' : 'border-slate-200 hover:bg-slate-50'}`}>
      <input type="radio" name={name} checked={checked} onChange={onChange} className="mt-1" />
      <span className="text-sm">
        <b>{title}</b>
        {desc && <span className="block text-xs text-slate-500">{desc}</span>}
      </span>
    </label>
  )
}

function ObjectiveCard({ index, count, objective: o, previous, ctx, onChange, onMove, onRemove }) {
  const set = (patch, key) => onChange({ ...o, ...patch }, key ? { key: `${key}-${o.objectiveId}` } : { important: true })
  // when does it show up?
  const after = previous && o.visibleWhen?.objectivesDone?.length === 1 && o.visibleWhen.objectivesDone[0] === previous.objectiveId && Object.keys(o.visibleWhen).length === 1
  const timing = o.hidden ? 'egg' : after ? 'after' : o.visibleWhen ? 'when' : 'always'
  const choose = (mode) => {
    if (mode === 'always') set({ hidden: false, visibleWhen: null })
    if (mode === 'after') set({ hidden: false, visibleWhen: { objectivesDone: [previous.objectiveId] } })
    if (mode === 'when') set({ hidden: false, visibleWhen: o.visibleWhen ?? {} })
    if (mode === 'egg') set({ hidden: true, visibleWhen: null })
  }
  const auto = !!o.doneWhen
  const hints = [0, 1, 2].map((i) => o.hints?.[i] ?? '')
  return (
    <div className="border border-slate-300 rounded-xl p-3 flex flex-col gap-3 bg-white">
      <div className="flex items-center gap-2">
        <span className="w-7 h-7 shrink-0 rounded-full bg-amber-500 text-white font-bold flex items-center justify-center">{index + 1}</span>
        <input value={o.text} onChange={(e) => set({ text: e.target.value }, 'text')} placeholder="目標（學生會看到的一句話），例如：秤取 5.00 g 氯化鈉" className={`${inputClass} ${o.text.trim() ? '' : 'border-red-300 bg-red-50'}`} />
        <button type="button" disabled={index === 0} onClick={() => onMove(-1)} aria-label="往前移" className="px-1.5 hover:bg-slate-100 rounded disabled:opacity-30">↑</button>
        <button type="button" disabled={index === count - 1} onClick={() => onMove(1)} aria-label="往後移" className="px-1.5 hover:bg-slate-100 rounded disabled:opacity-30">↓</button>
        <button type="button" onClick={onRemove} aria-label="刪除這個目標" className="px-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded">✕</button>
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-bold">👀 什麼時候出現在學生的目標欄？</p>
        <Radio name={`t-${o.objectiveId}`} checked={timing === 'always'} onChange={() => choose('always')} title="一開始就出現" />
        {previous && <Radio name={`t-${o.objectiveId}`} checked={timing === 'after'} onChange={() => choose('after')} title="等前一個目標完成才出現" desc={`前一個是「${previous.text || '（未命名）'}」。這樣目標會一個接一個浮現。`} />}
        <Radio name={`t-${o.objectiveId}`} checked={timing === 'when'} onChange={() => choose('when')} title="等某些條件成立才出現" />
        {timing === 'when' && <ConditionEditor value={o.visibleWhen} onChange={(v) => set({ visibleWhen: v ?? {} }, 'vis')} ctx={ctx} emptyHint="還沒設條件，目前會一直顯示。" />}
        <Radio name={`t-${o.objectiveId}`} checked={timing === 'egg'} onChange={() => choose('egg')} title="🥚 彩蛋：做到了才顯示" desc="學生事先看不到，完成之後才會出現在目標欄。" />
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-bold">✅ 怎樣算完成？</p>
        <Radio name={`d-${o.objectiveId}`} checked={auto} onChange={() => set({ doneWhen: o.doneWhen ?? {} })} title="自動判斷：這些條件成立就算完成" desc="例如「學生已經做過：拿到鑰匙」。" />
        {auto && <ConditionEditor value={o.doneWhen} onChange={(v) => set({ doneWhen: v ?? {} }, 'done')} ctx={ctx} emptyHint="還沒設條件，這個目標不會自動完成。請按下面「＋ 加一個條件」。" />}
        <Radio name={`d-${o.objectiveId}`} checked={!auto} onChange={() => set({ doneWhen: null })} title="用事件觸發" desc="在某個物件「點擊時」的步驟，加「🎯 完成任務目標」並選這一個。" />
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-bold">💡 提示（選填，學生按目標旁的燈泡逐層看）</p>
        {hints.map((h, i) => (
          <input key={i} value={h} onChange={(e) => set({ hints: hints.map((x, j) => (j === i ? e.target.value : x)) }, `hint${i}`)} placeholder={`提示 ${i + 1}`} className={inputClass} />
        ))}
      </div>

      <details className="border border-slate-200 rounded-lg p-2">
        <summary className="cursor-pointer text-sm text-slate-600">完成時要發生什麼事（選填，例如跳出「很好！接下來…」）</summary>
        <div className="mt-2">
          <EventEditor actions={o.onDone ?? []} onChange={(v) => set({ onDone: v }, 'ondone')} ctx={ctx} />
        </div>
      </details>
    </div>
  )
}

function ObjectivesTab({ stage, ctx, onUpdateStage }) {
  const list = stage.objectives ?? []
  const set = (objectives, opts) => onUpdateStage({ objectives }, opts ?? { important: true })
  const move = (i, d) => {
    const copy = [...list]
    ;[copy[i], copy[i + d]] = [copy[i + d], copy[i]]
    set(copy)
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm leading-relaxed">
        <p className="font-bold mb-1">🎯 什麼是任務目標？</p>
        <p>學生畫面上會一直有一個「目標欄」，告訴他現在該做什麼。完成一個，就自動出現下一個，還能附上提示。適合帶著學生一步一步完成實驗或調查。</p>
      </div>
      {list.length === 0 && <p className="text-slate-500 text-center py-4">這一關還沒有目標。目標欄只有在你新增目標之後才會出現。</p>}
      {list.map((o, i) => (
        <ObjectiveCard
          key={o.objectiveId}
          index={i}
          count={list.length}
          objective={o}
          previous={list[i - 1]}
          ctx={ctx}
          onChange={(next, opts) => set(list.map((x) => (x.objectiveId === o.objectiveId ? next : x)), opts)}
          onMove={(d) => move(i, d)}
          onRemove={() => set(list.filter((x) => x.objectiveId !== o.objectiveId))}
        />
      ))}
      <button type="button" onClick={() => set([...list, newObjective()])} className="self-start bg-amber-500 hover:bg-amber-400 text-white rounded-xl px-4 py-2 font-bold">
        ＋ 新增目標
      </button>
    </div>
  )
}

// ---------------------------------------------------------------- 開場與過關

function FlowTab({ stage, ctx, completionPlaces, onTitle, onUpdateStage }) {
  const auto = !!stage.completeWhen
  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-sm text-slate-500">關卡名稱（學生的關卡地圖上也會看到）</span>
        <input value={stage.title} onChange={(e) => onTitle(e.target.value)} className="bg-white border border-slate-300 rounded-lg px-3 py-2" />
      </label>

      <Block number={1} title="學生進入這一關時，會看到什麼？" hint="開場說明會在第一次進入這一關時出現一次，可以交代背景故事、這一關的任務。不需要就留空。">
        <RichTextEditor key={stage.stageId} value={stage.intro ?? ''} onChange={(html) => onUpdateStage({ intro: html }, { key: 'stage-intro' })} minHeight={100} />
      </Block>

      <Block number={2} title="怎樣算過關？" hint="過關的方式有三種，可以只用其中一種，也可以同時開。">
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm flex flex-col gap-1">
          <p className="font-bold">方式 A：學生做到某個動作，就過關</p>
          {completionPlaces.length > 0 ? (
            <>
              <p className="text-emerald-700">✅ 目前有 {completionPlaces.length} 個地方會讓學生過關：</p>
              <ul className="list-disc ml-5 text-slate-700">
                {completionPlaces.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-slate-600">
              設定方法：選一個物件 → 右側「互動」→「點擊時」→ 選「🏁 點到就過關」（或在步驟裡加「🏁 讓學生過關」）。
              {!auto && (stage.objectives ?? []).some((o) => !o.hidden) && (
                <span className="block text-emerald-700 font-bold mt-1">✅ 這一關有任務目標：學生把所有目標（彩蛋除外）都完成，就會自動過關，不用另外設定。</span>
              )}
              {!auto && (stage.objectives ?? []).filter((o) => !o.hidden).length === 0 && <span className="block text-red-600 font-bold mt-1">⚠️ 目前還沒有任何地方可以過關，學生會玩不完！</span>}
            </p>
          )}
        </div>
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm flex flex-col gap-2">
          <label className="flex items-center gap-2 font-bold">
            <input type="checkbox" checked={auto} onChange={(e) => onUpdateStage({ completeWhen: e.target.checked ? {} : null }, { key: 'stage-completewhen-toggle' })} />
            方式 B：學生完成某些事（或某些目標），系統自動讓他過關
          </label>
          {auto ? (
            <ConditionEditor
              value={stage.completeWhen}
              onChange={(v) => onUpdateStage({ completeWhen: v ?? {} }, { key: 'stage-completewhen' })}
              ctx={ctx}
              emptyHint="還沒設定要完成哪些事。請按下面「＋ 加一個條件」，例如「已完成某個任務目標」。"
            />
          ) : (
            <p className="text-slate-500">例如：「拿到鑰匙」而且「打開保險箱」，或「已完成所有任務目標」，就自動過關，不需要再點某個物件。</p>
          )}
        </div>
      </Block>

      <Block number={3} title="過關之後要做什麼？" hint="例如跳出恭喜的話。不需要就留空。">
        <EventEditor actions={stage.onComplete ?? []} onChange={(v) => onUpdateStage({ onComplete: v }, { key: 'stage-oncomplete' })} ctx={ctx} />
      </Block>

      <Block number={4} title="學生重玩這一關時" hint="學生過關之後，還可以從關卡地圖再進來玩一次。">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={!!stage.resetOnRetry} onChange={(e) => onUpdateStage({ resetOnRetry: e.target.checked }, { important: true })} className="mt-1" />
          <span>
            <b>重玩時，把這一關重置</b>
            <span className="block text-xs text-slate-500">場景裡物件的顯示、答案鎖、換過的背景、這一關事件設定過的進度記號都回到一開始。不勾的話，重玩時一切維持原樣。</span>
          </span>
        </label>
      </Block>
    </div>
  )
}

// Everything about one stage: the opening, how to win, the objectives, and what replaying does.
export default function StageDialog({ stage, ctx, completionPlaces, onTitle, onUpdateStage, onClose, initialTab = 'flow' }) {
  const [tab, setTab] = useState(initialTab)
  const tabs = [
    { key: 'flow', label: '開場與過關' },
    { key: 'goals', label: '🎯 任務目標', badge: (stage.objectives ?? []).length || '' },
  ]
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ backgroundColor: 'rgba(0, 10, 30, 0.6)' }}>
      <div className="bg-white text-navy rounded-2xl w-full max-w-2xl max-h-[88vh] flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-5 pt-3 gap-3">
          <h2 className="text-lg font-bold">🏁 關卡設定：{stage.title}</h2>
          <button type="button" onClick={onClose} className="bg-cyan hover:bg-cyan-dark text-white rounded-lg px-4 py-1.5 font-bold">
            完成
          </button>
        </div>
        <div className="flex border-b border-slate-200 px-5 gap-1 mt-2">
          {tabs.map((t) => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)} className={`px-4 py-2 text-sm rounded-t-lg border-b-2 -mb-px ${tab === t.key ? 'border-cyan font-bold' : 'border-transparent text-slate-500 hover:text-navy'}`}>
              {t.label}
              {t.badge ? <span className="ml-1 text-xs bg-amber-100 text-amber-800 rounded-full px-1.5">{t.badge}</span> : null}
            </button>
          ))}
        </div>
        <div className="overflow-y-auto p-5">
          {tab === 'flow' ? <FlowTab stage={stage} ctx={ctx} completionPlaces={completionPlaces} onTitle={onTitle} onUpdateStage={onUpdateStage} /> : <ObjectivesTab stage={stage} ctx={ctx} onUpdateStage={onUpdateStage} />}
        </div>
      </div>
    </div>
  )
}
