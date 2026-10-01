import { ConditionEditor } from './EventEditor.jsx'

const VISIBILITY = [
  { mode: 'always', icon: '👁', title: '一直看得到', desc: '遊戲一開始就在畫面上。' },
  { mode: 'hidden', icon: '🙈', title: '一開始看不到', desc: '要靠某個動作「讓東西出現」才會現身，例如打開抽屜後露出線索。' },
  { mode: 'when', icon: '⏳', title: '等某件事發生才看得到', desc: '條件一成立就自動出現，例如拿到鑰匙後，門才出現。' },
]

// "When can the student see it?" — one question with three answers, instead of two settings that fight each other.
export default function VisibilityBlock({ object, ctx, onUpdate }) {
  const mode = object.showWhen ? 'when' : object.visible === false ? 'hidden' : 'always'

  function choose(next) {
    if (next === 'always') onUpdate(object.id, { visible: true, showWhen: null }, { important: true })
    if (next === 'hidden') onUpdate(object.id, { visible: false, showWhen: null }, { important: true })
    if (next === 'when') onUpdate(object.id, { visible: true, showWhen: object.showWhen ?? {} }, { important: true })
  }

  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-bold text-sm">👀 學生什麼時候看得到它？</h3>
      {VISIBILITY.map((v) => (
        <label key={v.mode} className={`flex gap-2 rounded-lg border p-2 cursor-pointer ${mode === v.mode ? 'border-cyan bg-cyan/5' : 'border-slate-200 hover:bg-slate-50'}`}>
          <input type="radio" name={`vis-${object.id}`} checked={mode === v.mode} onChange={() => choose(v.mode)} className="mt-1" />
          <span className="text-sm">
            <b>
              {v.icon} {v.title}
            </b>
            <span className="block text-xs text-slate-500">{v.desc}</span>
          </span>
        </label>
      ))}
      {mode === 'when' && (
        <ConditionEditor
          value={object.showWhen}
          onChange={(v) => onUpdate(object.id, { showWhen: v ?? {} }, { key: `showwhen-${object.id}` })}
          ctx={ctx}
          emptyHint="還沒設條件，目前會一直看得到。請按下面「＋ 加一個條件」。"
        />
      )}
    </section>
  )
}
