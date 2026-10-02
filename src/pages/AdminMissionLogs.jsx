import { Fragment, useEffect, useMemo, useState } from 'react'
import AdminNav from '../components/AdminNav.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import { exportXlsx, todayStamp } from '../lib/exportExcel.js'
import { formatDateTime } from '../lib/logQueries.js'
import { EMPTY_MISSION_FILTERS, deleteMissionSessions, listMissionTitles, queryMissionData } from '../lib/missionLogQueries.js'
import { MISSION_EVENT_LABELS, analyzeStuck, describeMissionEvent, summarizeMissionSession } from '../lib/missionStats.js'
import { GRADES, PURPOSES } from '../lib/studentInfo.js'

const TH = 'py-2 px-3 text-left whitespace-nowrap font-bold text-slate-500 text-sm'
const TD = 'py-2 px-3 whitespace-nowrap'
// free-text columns (names, class, mission title): very long values are cut short so they cannot push the other columns off screen
const TDX = `${TD} max-w-[11rem] overflow-hidden text-ellipsis`
const FIELD = 'flex flex-col gap-1 text-sm text-slate-600'
const CONTROL = 'bg-white border border-slate-300 rounded-lg px-3 py-2 text-navy'
const BTN = 'bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-40 rounded-lg px-4 py-2 text-sm font-bold'
const PAGE_SIZE = 30
const COLUMNS = ['日期', '任務', '年級', '班級', '座號', '姓名', '完成關卡數', '總時間（分）', '答錯次數', '看提示次數', '放棄次數', '狀態', '']
// 時間軸預設不顯示「進入場景／點擊物件」這類很瑣碎的事件，需要時可打開
const NOISY = new Set(['scene_enter', 'object_click'])

export default function AdminMissionLogs() {
  const [filters, setFilters] = useState(EMPTY_MISSION_FILTERS)
  const [missions, setMissions] = useState([])
  const [results, setResults] = useState(null) // { rows, names, titles }
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [tab, setTab] = useState('students')
  const [page, setPage] = useState(0)
  const [expanded, setExpanded] = useState(() => new Set())
  const [showNoisy, setShowNoisy] = useState(false)
  const [confirm, setConfirm] = useState(null) // { kind: 'single', row } | { kind: 'batch' }
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_MISSION_FILTERS)

  useEffect(() => {
    listMissionTitles().then(setMissions).catch(() => {})
  }, [])

  const set = (patch) => setFilters((f) => ({ ...f, ...patch }))

  async function runSearch(f) {
    setLoading(true)
    setError(null)
    try {
      setResults(await queryMissionData(f))
      setAppliedFilters(f)
      setPage(0)
      setExpanded(new Set())
    } catch (err) {
      setError(err.message ?? String(err))
    } finally {
      setLoading(false)
    }
  }

  const rows = useMemo(
    () => (results?.rows ?? []).map((r) => ({ ...r, summary: summarizeMissionSession(r, (id) => results.titles.get(id) ?? '（已刪除的任務）') })),
    [results],
  )
  const stuck = useMemo(() => (results ? analyzeStuck(results.rows, results.names) : null), [results])
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const shown = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const onePerMission = new Set(rows.map((r) => r.session.mission_id)).size <= 1

  function toggle(uuid) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(uuid)) next.delete(uuid)
      else next.add(uuid)
      return next
    })
  }

  function exportSummary() {
    exportXlsx(
      `任務紀錄摘要_${todayStamp()}.xlsx`,
      '摘要',
      rows.map(({ summary: s }) => ({
        日期: formatDateTime(s.date),
        任務: s.mission,
        年級: s.grade,
        班級: s.className,
        座號: s.seat,
        姓名: s.name,
        用途: s.purpose,
        完成關卡數: s.stagesDone,
        '總時間（分鐘）': s.minutes,
        答題次數: s.attempts,
        答錯次數: s.wrong,
        看提示次數: s.hints,
        放棄次數: s.giveUps,
        狀態: s.status,
      })),
    )
  }

  function exportFull() {
    const { names } = results
    const events = rows.flatMap(({ session, logs, summary: s }) =>
      logs.map((l) => ({
        日期: formatDateTime(session.started_at),
        任務: s.mission,
        年級: session.grade,
        班級: session.class_name,
        座號: session.seat_number,
        姓名: session.student_name,
        流水號: l.seq,
        時間: formatDateTime(l.client_ts ?? l.created_at),
        關卡: names.stages.get(l.stage_id) ?? l.stage_id ?? '',
        場景: names.scenes.get(l.scene_id) ?? l.scene_id ?? '',
        事件: MISSION_EVENT_LABELS[l.event_type] ?? l.event_type,
        內容: describeMissionEvent(l, names),
        物件代號: l.block_id ?? '',
      })),
    )
    exportXlsx(`任務紀錄完整Logs_${todayStamp()}.xlsx`, 'Logs', events)
  }

  function exportStuck() {
    exportXlsx(`卡關分析_${todayStamp()}.xlsx`, '題目', [
      ...stuck.locks.map((s) => ({ 題目: s.name, 位置: s.where, 作答人數: s.students, 作答次數: s.attempts, 答錯次數: s.wrong, 答錯率: s.wrongRate, 答錯人數: s.wrongStudents, 平均答幾次才對: s.avgAttempts, 答對人數: s.solved, 放棄人數: s.giveUps, 看提示次數: s.hints })),
    ])
  }

  async function handleDelete() {
    const uuids = confirm.kind === 'single' ? [confirm.row.session.session_uuid] : rows.map((r) => r.session.session_uuid)
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteMissionSessions(uuids)
      setConfirm(null)
      setNotice(`已刪除 ${uuids.length} 筆記錄`)
      await runSearch(appliedFilters)
    } catch (err) {
      setDeleteError(`刪除失敗：${err.message ?? err}`)
    } finally {
      setDeleting(false)
    }
  }

  const canExport = rows.length > 0
  const confirmMessage = !confirm
    ? ''
    : confirm.kind === 'single'
      ? `確定要刪除 ${confirm.row.summary.name} 於 ${formatDateTime(confirm.row.summary.date)} 玩「${confirm.row.summary.mission}」的記錄？此操作無法還原。`
      : `確定要刪除目前篩選結果中的所有 ${rows.length} 筆記錄？此操作無法還原。（建議先按「匯出」留一份備份。）`

  return (
    <div className="min-h-screen bg-paper text-navy md:flex">
      <AdminNav active="mission-logs" />
      <div className="flex-1 min-w-0 w-full px-6 py-8 flex flex-col gap-5">
        <h1 className="text-2xl font-bold">🕵️ 任務紀錄</h1>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            setNotice(null)
            runSearch(filters)
          }}
          className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm grid grid-cols-2 lg:grid-cols-4 gap-3 items-end"
        >
          <label className={`${FIELD} col-span-2`}>
            任務
            <select value={filters.missionId} onChange={(e) => set({ missionId: e.target.value })} className={CONTROL}>
              <option value="">全部任務</option>
              {missions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
          </label>
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
            學生姓名（模糊搜尋）
            <input value={filters.studentName} onChange={(e) => set({ studentName: e.target.value })} className={CONTROL} />
          </label>
          <button type="submit" disabled={loading} className="bg-cyan hover:bg-cyan-dark disabled:opacity-50 text-white rounded-xl px-5 py-2 font-bold">
            {loading ? '查詢中...' : '查詢'}
          </button>
        </form>

        {error && <p className="text-red-600">查詢失敗：{error}</p>}
        {notice && <p className="text-green-700 font-bold">{notice}</p>}
        {results === null && !loading && (
          <p className="text-slate-500">請設定查詢條件後按「查詢」（什麼都不選＝看全部）。學生玩任務時，離線的紀錄會在恢復網路後補傳，所以剛玩完可能要等一下才看得到。</p>
        )}

        {results !== null && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {[
                ['students', `👥 學生紀錄（${rows.length}）`],
                ['stuck', '🧩 卡關分析'],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={`px-4 py-2 rounded-lg font-bold text-sm ${tab === id ? 'bg-navy text-white' : 'bg-white border border-slate-300 hover:bg-slate-100'}`}
                >
                  {label}
                </button>
              ))}
              <span className="flex-1" />
              {tab === 'students' ? (
                <>
                  <button type="button" disabled={!canExport} onClick={exportSummary} className={BTN}>
                    匯出摘要 Excel
                  </button>
                  <button type="button" disabled={!canExport} onClick={exportFull} className={BTN}>
                    匯出完整 Logs Excel
                  </button>
                  <button
                    type="button"
                    disabled={!canExport}
                    onClick={() => {
                      setDeleteError(null)
                      setConfirm({ kind: 'batch' })
                    }}
                    className="bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 disabled:opacity-40 rounded-lg px-4 py-2 text-sm font-bold"
                  >
                    🗑️ 批次刪除
                  </button>
                </>
              ) : (
                <button type="button" disabled={!stuck?.locks.length} onClick={exportStuck} className={BTN}>
                  匯出卡關分析 Excel
                </button>
              )}
            </div>

            {tab === 'students' && (
              <>
                <div className="overflow-x-auto bg-white rounded-2xl border border-slate-200 shadow-sm">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200">
                        {COLUMNS.map((h, i) => (
                          <th key={h || `a${i}`} className={TH}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.length === 0 && (
                        <tr>
                          <td colSpan={COLUMNS.length} className="py-8 text-center text-slate-400">
                            查無資料
                          </td>
                        </tr>
                      )}
                      {shown.map((row) => {
                        const { session, logs, summary: s } = row
                        const open = expanded.has(session.session_uuid)
                        const visible = logs.filter((l) => showNoisy || !NOISY.has(l.event_type))
                        return (
                          <Fragment key={session.session_uuid}>
                            <tr className="border-b border-slate-100">
                              <td className={TD}>{formatDateTime(s.date)}</td>
                              <td className={TDX} title={s.mission}>{s.mission}</td>
                              <td className={TD}>{s.grade}</td>
                              <td className={TDX} title={s.className}>{s.className}</td>
                              <td className={TD}>{s.seat}</td>
                              <td className={`${TDX} font-bold`} title={s.name}>{s.name}</td>
                              <td className={TD}>{s.stagesDone}</td>
                              <td className={TD}>{s.minutes}</td>
                              <td className={TD}>{s.wrong}</td>
                              <td className={TD}>{s.hints}</td>
                              <td className={TD}>{s.giveUps}</td>
                              <td className={TD}>
                                <span className={s.completed ? 'text-green-700 font-bold' : 'text-slate-500'}>{s.status}</span>
                              </td>
                              <td className={TD}>
                                <div className="flex gap-2">
                                  <button type="button" onClick={() => toggle(session.session_uuid)} className="bg-slate-100 hover:bg-slate-200 rounded-lg px-3 py-1 text-sm">
                                    {open ? '收合' : '時間軸'}
                                  </button>
                                  <button
                                    type="button"
                                    title="刪除這筆記錄"
                                    aria-label={`刪除 ${s.name} 的記錄`}
                                    onClick={() => {
                                      setDeleteError(null)
                                      setConfirm({ kind: 'single', row })
                                    }}
                                    className="bg-red-50 hover:bg-red-100 rounded-lg px-2 py-1 text-sm"
                                  >
                                    🗑️
                                  </button>
                                </div>
                              </td>
                            </tr>
                            {open && (
                              <tr className="border-b border-slate-100 bg-slate-50">
                                <td colSpan={COLUMNS.length} className="px-6 py-3">
                                  <label className="flex items-center gap-2 text-sm text-slate-600 mb-2">
                                    <input type="checkbox" checked={showNoisy} onChange={(e) => setShowNoisy(e.target.checked)} />
                                    也顯示「進入場景」「點擊物件」
                                  </label>
                                  {visible.length === 0 ? (
                                    <p className="text-slate-400 text-sm">沒有可顯示的事件</p>
                                  ) : (
                                    <table className="border-collapse text-sm">
                                      <thead>
                                        <tr>
                                          {['時間', '關卡', '事件', '內容'].map((h) => (
                                            <th key={h} className={TH}>
                                              {h}
                                            </th>
                                          ))}
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {visible.map((l) => (
                                          <tr key={l.id} className="border-t border-slate-200">
                                            <td className={TD}>{formatDateTime(l.client_ts ?? l.created_at)}</td>
                                            <td className={TD}>{results.names.stages.get(l.stage_id) ?? ''}</td>
                                            <td className={`${TD} font-bold`}>{MISSION_EVENT_LABELS[l.event_type] ?? l.event_type}</td>
                                            <td className="py-2 px-3">{describeMissionEvent(l, results.names)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  )}
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {pages > 1 && (
                  <div className="flex items-center justify-center gap-3">
                    <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)} className={BTN}>
                      ← 上一頁
                    </button>
                    <span className="text-slate-600 text-sm">
                      第 {page + 1} / {pages} 頁
                    </span>
                    <button type="button" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} className={BTN}>
                      下一頁 →
                    </button>
                  </div>
                )}
              </>
            )}

            {tab === 'stuck' && stuck && (
              <div className="flex flex-col gap-6">
                {!onePerMission && <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm">目前包含好幾個任務，建議在上面的「任務」選單選一個再看，數字才不會混在一起。</p>}
                <p className="text-slate-600 text-sm">共統計 {stuck.total} 位學生（場次）。排在最上面的是「最多人放棄、答錯率最高」的題目，也許該調整題目或提示。</p>
                <section className="flex flex-col gap-2">
                  <h2 className="font-bold text-lg">🔐 題目（答案鎖）</h2>
                  <div className="overflow-x-auto bg-white rounded-2xl border border-slate-200 shadow-sm">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200">
                          {['題目', '位置', '作答人數', '作答次數', '答錯率', '答錯人數', '平均答幾次才對', '答對人數', '放棄人數', '看提示次數'].map((h) => (
                            <th key={h} className={TH}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {stuck.locks.length === 0 && (
                          <tr>
                            <td colSpan={10} className="py-6 text-center text-slate-400">
                              還沒有人作答過題目
                            </td>
                          </tr>
                        )}
                        {stuck.locks.map((s) => (
                          <tr key={s.id} className="border-b border-slate-100">
                            <td className={`${TD} font-bold`}>{s.name}</td>
                            <td className={`${TD} text-slate-500`}>{s.where}</td>
                            <td className={TD}>{s.students}</td>
                            <td className={TD}>{s.attempts}</td>
                            <td className={`${TD} ${s.wrongRateValue >= 0.5 ? 'text-red-600 font-bold' : ''}`}>{s.wrongRate}</td>
                            <td className={TD}>{s.wrongStudents}</td>
                            <td className={TD}>{s.avgAttempts}</td>
                            <td className={TD}>{s.solved}</td>
                            <td className={`${TD} ${s.giveUps ? 'text-red-600 font-bold' : ''}`}>{s.giveUps}</td>
                            <td className={TD}>{s.hints}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
                <section className="flex flex-col gap-2">
                  <h2 className="font-bold text-lg">🎯 任務目標</h2>
                  <div className="overflow-x-auto bg-white rounded-2xl border border-slate-200 shadow-sm">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200">
                          {['任務目標', '完成人數', '完成率', '看提示次數'].map((h) => (
                            <th key={h} className={TH}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {stuck.objectives.length === 0 && (
                          <tr>
                            <td colSpan={4} className="py-6 text-center text-slate-400">
                              還沒有任務目標的紀錄
                            </td>
                          </tr>
                        )}
                        {stuck.objectives.map((s) => (
                          <tr key={s.id} className="border-b border-slate-100">
                            <td className={`${TD} font-bold`}>{s.text}</td>
                            <td className={TD}>{s.done}</td>
                            <td className={TD}>{s.doneRate}</td>
                            <td className={TD}>{s.hints}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            )}
          </>
        )}
      </div>

      {confirm && (
        <ConfirmDialog
          title={confirm.kind === 'batch' ? '批次刪除' : '刪除任務記錄'}
          message={confirmMessage}
          confirmText="確定刪除"
          busy={deleting}
          error={deleteError}
          onConfirm={handleDelete}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}
