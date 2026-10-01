import RichTextEditor from '../components/RichTextEditor.jsx'
import { ConditionEditor, EventEditor } from './EventEditor.jsx'

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

// The whole "關卡" is configured here, in the order a student experiences it: opening text → how to win → what happens after.
// `completionPlaces` = where an event currently ends the stage (from missionEvents.completionSources).
export default function StageDialog({ stage, ctx, completionPlaces, onTitle, onUpdateStage, onClose }) {
  const auto = !!stage.completeWhen

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ backgroundColor: 'rgba(0, 10, 30, 0.6)' }}>
      <div className="bg-white text-navy rounded-2xl w-full max-w-2xl max-h-[88vh] flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
          <h2 className="text-lg font-bold">🏁 關卡設定</h2>
          <button type="button" onClick={onClose} className="bg-cyan hover:bg-cyan-dark text-white rounded-lg px-4 py-1.5 font-bold">
            完成
          </button>
        </div>

        <div className="overflow-y-auto p-5 flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-slate-500">關卡名稱（目前一個任務只有一關）</span>
            <input value={stage.title} onChange={(e) => onTitle(e.target.value)} className="bg-white border border-slate-300 rounded-lg px-3 py-2" />
          </label>

          <Block number={1} title="學生一開始會看到什麼？" hint="開場說明會在遊戲開始前出現一次，可以交代背景故事、任務目標。不需要就留空。">
            <RichTextEditor key={stage.stageId} value={stage.intro ?? ''} onChange={(html) => onUpdateStage({ intro: html }, { key: 'stage-intro' })} minHeight={100} />
          </Block>

          <Block number={2} title="怎樣算過關？" hint="學生過關的方式有兩種，可以只用其中一種，也可以兩種都開。">
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
                  {!auto && <span className="block text-red-600 font-bold mt-1">⚠️ 目前還沒有任何地方可以過關，學生會玩不完！</span>}
                </p>
              )}
            </div>

            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm flex flex-col gap-2">
              <label className="flex items-center gap-2 font-bold">
                <input
                  type="checkbox"
                  checked={auto}
                  onChange={(e) => onUpdateStage({ completeWhen: e.target.checked ? {} : null }, { key: 'stage-completewhen-toggle' })}
                />
                方式 B：學生完成某些事，系統自動讓他過關
              </label>
              {auto ? (
                <ConditionEditor
                  value={stage.completeWhen}
                  onChange={(v) => onUpdateStage({ completeWhen: v ?? {} }, { key: 'stage-completewhen' })}
                  ctx={ctx}
                  emptyHint="還沒設定要完成哪些事。請按下面「＋ 加一個條件」，例如「學生已經做過：找到所有線索」。"
                />
              ) : (
                <p className="text-slate-500">例如：「拿到鑰匙」而且「打開保險箱」，兩件事都完成就自動過關，不需要再點某個物件。</p>
              )}
            </div>
          </Block>

          <Block number={3} title="過關之後要做什麼？" hint="例如跳出恭喜的話。學生按下去之後，會看到過關畫面。不需要就留空。">
            <EventEditor actions={stage.onComplete ?? []} onChange={(v) => onUpdateStage({ onComplete: v }, { key: 'stage-oncomplete' })} ctx={ctx} />
          </Block>
        </div>
      </div>
    </div>
  )
}
