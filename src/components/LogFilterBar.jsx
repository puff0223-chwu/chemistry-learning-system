import { GRADES, PURPOSES } from '../lib/studentInfo.js'

const FIELD = 'flex flex-col gap-1 text-sm text-slate-600'
const CONTROL = 'bg-white border border-slate-300 rounded-lg px-3 py-2 text-navy'

export default function LogFilterBar({ filters, onChange, topics, onSearch, loading, nameHint }) {
  const set = (patch) => onChange({ ...filters, ...patch })
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSearch()
      }}
      className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm grid grid-cols-2 lg:grid-cols-4 gap-3 items-end"
    >
      <label className={FIELD}>
        起始日期
        <input type="date" value={filters.startDate} onChange={(e) => set({ startDate: e.target.value })} className={CONTROL} />
      </label>
      <label className={FIELD}>
        結束日期
        <input type="date" value={filters.endDate} onChange={(e) => set({ endDate: e.target.value })} className={CONTROL} />
      </label>
      <label className={FIELD}>
        用途
        <select value={filters.purpose} onChange={(e) => set({ purpose: e.target.value })} className={CONTROL}>
          <option value="">全部</option>
          {PURPOSES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
      <label className={FIELD}>
        年級
        <select value={filters.grade} onChange={(e) => set({ grade: e.target.value })} className={CONTROL}>
          <option value="">全部</option>
          {GRADES.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </label>
      <label className={FIELD}>
        班級（模糊搜尋）
        <input value={filters.className} onChange={(e) => set({ className: e.target.value })} className={CONTROL} />
      </label>
      <label className={FIELD}>
        主題
        <select value={filters.topicId} onChange={(e) => set({ topicId: e.target.value })} className={CONTROL}>
          <option value="">全部</option>
          {topics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <label className={FIELD}>
        學生姓名（模糊搜尋）
        <input value={filters.studentName} onChange={(e) => set({ studentName: e.target.value })} className={CONTROL} />
      </label>
      <button
        type="submit"
        disabled={loading}
        className="bg-cyan hover:bg-cyan-dark disabled:opacity-50 text-white rounded-xl px-5 py-2 font-bold"
      >
        {loading ? '查詢中...' : '查詢'}
      </button>
      {nameHint && <p className="col-span-2 lg:col-span-4 text-xs text-slate-500">{nameHint}</p>}
    </form>
  )
}
