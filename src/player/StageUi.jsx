import { Fragment, useState } from 'react'
import { layoutStages } from '../editor/graphLayout.js'

const STATUS = {
  locked: { icon: '🔒', box: 'bg-slate-700/60 border-slate-500 text-white/60', badge: '還沒解鎖' },
  open: { icon: '▶', box: 'bg-white border-cyan text-navy hover:shadow-[0_0_24px_rgba(0,212,255,0.55)] cursor-pointer', badge: '可以玩' },
  done: { icon: '✅', box: 'bg-emerald-50 border-emerald-400 text-navy hover:shadow-[0_0_24px_rgba(52,211,153,0.5)] cursor-pointer', badge: '已完成' },
}

function lockedHint(card) {
  if (card.needs.length === 0) return '完成前面的關卡後解鎖'
  const names = card.needs.map((n) => `「${n}」`)
  return card.join === 'any' || names.length === 1 ? `完成 ${names.join(' 或 ')} 後解鎖` : `完成 ${names.join(' 和 ')} 後解鎖`
}

// The student's stage map: stages in columns, left to right, in the order they open up.
// Locked stages show what to do first (or are hidden altogether when the teacher turned on 隱藏未解鎖關卡).
export function StageMapScreen({ engine, state }) {
  const cards = engine.stageCards()
  const hideLocked = !!engine.settings.hideLockedStages
  const pos = layoutStages(engine.stages, engine.links, { w: 1, h: 1 })
  const shown = cards.filter((c) => !(hideLocked && c.status === 'locked'))
  const columns = [...new Set(shown.map((c) => pos[c.stage.stageId].x))].sort((a, b) => a - b).map((x) => shown.filter((c) => pos[c.stage.stageId].x === x).sort((a, b) => pos[a.stage.stageId].y - pos[b.stage.stageId].y))
  const doneCount = cards.filter((c) => c.status === 'done').length

  return (
    <div className="absolute inset-0 overflow-auto flex flex-col items-center justify-center p-6 pt-20" style={{ background: 'linear-gradient(160deg, #0f172a, #1e293b 60%, #0c4a6e)' }}>
      <h2 className="text-white text-3xl font-extrabold mb-1">選擇關卡</h2>
      <p className="text-white/70 mb-8">
        已完成 {doneCount} ／ {cards.length} 關{hideLocked && cards.some((c) => c.status === 'locked') ? '・還有關卡等你解鎖' : ''}
      </p>
      <div className="flex items-stretch gap-3">
        {columns.map((col, ci) => (
          <Fragment key={ci}>
            {ci > 0 && <span className="self-center text-white/40 text-4xl select-none">→</span>}
            <div className="flex flex-col justify-center gap-4">
              {col.map((c) => {
                const st = STATUS[c.status]
                const playable = c.status !== 'locked'
                const started = !!state.lastScene[c.stage.stageId]
                return (
                  <button
                    key={c.stage.stageId}
                    type="button"
                    disabled={!playable}
                    onClick={() => engine.enterStage(c.stage.stageId)}
                    className={`w-64 rounded-2xl border-2 p-4 text-left transition-shadow ${st.box}`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-2xl">{st.icon}</span>
                      <span className="text-lg font-bold leading-tight">{c.status === 'locked' ? '？？？' : c.stage.title}</span>
                    </span>
                    {c.status === 'locked' ? (
                      <span className="block text-sm mt-2">{lockedHint(c)}</span>
                    ) : (
                      <span className="block text-sm mt-2 opacity-80">{c.status === 'done' ? '再玩一次' : started ? '繼續這一關' : '開始這一關'}</span>
                    )}
                  </button>
                )
              })}
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  )
}

// The objective bar: what the student should do right now. Done ones are ticked, a new one appears when it is its
// turn, and the 💡 next to a pending one reveals its hints one at a time.
export function ObjectivesBar({ engine }) {
  const [open, setOpen] = useState(true)
  const list = engine.currentObjectives()
  if (list.length === 0) return null
  const left = list.filter((o) => !o.done).length
  return (
    <div className="absolute top-16 left-3 z-30 w-72 max-w-[calc(100%-1.5rem)] bg-black/60 text-white backdrop-blur rounded-xl shadow-lg">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between px-3 py-2 text-sm font-bold">
        <span>🎯 任務目標 {left === 0 ? '（全部完成！）' : `（還有 ${left} 個）`}</span>
        <span>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <ul className="px-3 pb-3 flex flex-col gap-2">
          {list.map((o) => (
            <li key={o.id} className="text-sm">
              <div className="flex items-start gap-2">
                <span>{o.done ? '✅' : '⬜'}</span>
                <span className={`flex-1 ${o.done ? 'line-through opacity-60' : ''}`}>{o.text}</span>
                {!o.done && o.hints.length > o.hintsShown && (
                  <button type="button" onClick={() => engine.requestObjectiveHint(o.id)} title="給我一個提示" aria-label="給我一個提示" className="shrink-0 w-7 h-7 rounded-full bg-amber-400/90 hover:bg-amber-300 text-navy">
                    💡
                  </button>
                )}
              </div>
              {!o.done &&
                o.hints.slice(0, o.hintsShown).map((h, i) => (
                  <p key={i} className="mt-1 ml-6 bg-amber-100 text-amber-900 rounded-lg px-2 py-1 text-xs">
                    💡 {h}
                  </p>
                ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
