import { useState } from 'react'

function Row({ name, info, onRename }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const neverSet = info.sets.length === 0
  const neverUsed = info.uses.length === 0

  function commit() {
    const next = draft.trim()
    if (next && next !== name) onRename(name, next)
    setEditing(false)
  }

  return (
    <li className="border border-slate-200 rounded-xl p-3 flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        {editing ? (
          <>
            <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && commit()} className="flex-1 bg-white border border-slate-300 rounded-lg px-2 py-1" />
            <button type="button" onClick={commit} className="bg-cyan text-white rounded-lg px-3 py-1 text-sm font-bold">
              儲存
            </button>
            <button type="button" onClick={() => setEditing(false)} className="bg-slate-100 rounded-lg px-3 py-1 text-sm">
              取消
            </button>
          </>
        ) : (
          <>
            <span className="flex-1 font-bold">📌 {name}</span>
            <button
              type="button"
              onClick={() => {
                setDraft(name)
                setEditing(true)
              }}
              className="bg-slate-100 hover:bg-slate-200 rounded-lg px-3 py-1 text-sm"
              title="改名會同步改掉所有用到它的地方"
            >
              改名
            </button>
          </>
        )}
      </div>
      <div className="text-sm">
        <p className="font-bold text-purple-700">在這些地方被「記住」：</p>
        {neverSet ? <p className="text-red-600">⚠️ 沒有任何地方會記住它，用到它的條件永遠不會成立。</p> : <ul className="list-disc ml-5 text-slate-700">{info.sets.map((s, i) => <li key={i}>{s}</li>)}</ul>}
      </div>
      <div className="text-sm">
        <p className="font-bold text-teal-700">在這些地方被「檢查」：</p>
        {neverUsed ? <p className="text-slate-500">還沒有被用到（只是記下來而已，沒有影響）。</p> : <ul className="list-disc ml-5 text-slate-700">{info.uses.map((s, i) => <li key={i}>{s}</li>)}</ul>}
      </div>
    </li>
  )
}

// Overview of every progress marker: where it is remembered, where it is checked, and one place to rename it.
export default function FlagManager({ usage, onRename, onClose }) {
  const entries = [...usage.entries()].sort(([a], [b]) => a.localeCompare(b, 'zh-Hant'))
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ backgroundColor: 'rgba(0, 10, 30, 0.6)' }}>
      <div className="bg-white text-navy rounded-2xl w-full max-w-xl max-h-[88vh] flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
          <h2 className="text-lg font-bold">📌 進度記號</h2>
          <button type="button" onClick={onClose} className="bg-cyan hover:bg-cyan-dark text-white rounded-lg px-4 py-1.5 font-bold">
            完成
          </button>
        </div>
        <div className="overflow-y-auto p-5 flex flex-col gap-3">
          <div className="bg-cyan/10 rounded-xl p-3 text-sm leading-relaxed">
            <p className="font-bold mb-1">什麼是「進度記號」？</p>
            <p>
              它是遊戲幫學生記下的「做過的事」，像便利貼。例如學生撿到鑰匙時「記住：拿到鑰匙」，之後門就可以問「學生有拿到鑰匙嗎？」來決定要不要打開。
            </p>
            <p className="mt-1 text-slate-600">在「點擊時」用「📌 記住一件事」新增，在條件裡用「✅ 學生已經做過…」檢查。這裡可以看全部的記號、改名、檢查有沒有漏接。</p>
          </div>
          {entries.length === 0 && <p className="text-slate-500 text-center py-6">目前還沒有任何進度記號。</p>}
          <ul className="flex flex-col gap-2">
            {entries.map(([name, info]) => (
              <Row key={name} name={name} info={info} onRename={onRename} />
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
