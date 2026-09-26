import { Fragment, useEffect, useMemo, useState } from 'react'
import AdminNav from '../components/AdminNav.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import LogFilterBar from '../components/LogFilterBar.jsx'
import { supabase } from '../lib/supabase.js'
import { exportXlsx, todayStamp } from '../lib/exportExcel.js'
import {
  EMPTY_FILTERS,
  EVENT_LABELS,
  deleteTaskSessions,
  describeQuestion,
  formatDateTime,
  queryTaskData,
  summarizeTask,
  tagNameMap,
} from '../lib/logQueries.js'

const TH = 'py-2 px-3 text-left whitespace-nowrap font-bold text-slate-500 text-sm'
const TD = 'py-2 px-3 whitespace-nowrap'
const COLUMNS = ['日期', '用途', '年級', '班級', '座號', '姓名', '主題', '題目難度', '作答題數', '答對題數', '答對率', '平均提示次數', '求助次數', '總花費時間（分）', '是否完成', '']

export default function AdminTaskLogs() {
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [applied, setApplied] = useState(EMPTY_FILTERS)
  const [topics, setTopics] = useState([])
  const [tagNames, setTagNames] = useState(() => new Map())
  const [results, setResults] = useState(null) // { rows, questions }
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [expanded, setExpanded] = useState(() => new Set())
  const [confirm, setConfirm] = useState(null) // { kind: 'single', row } | { kind: 'batch' }
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)

  useEffect(() => {
    supabase
      .from('topics')
      .select('id, name')
      .order('created_at', { ascending: true })
      .then(({ data }) => setTopics(data ?? []))
    tagNameMap().then(setTagNames)
  }, [])

  async function runSearch(searchFilters) {
    setLoading(true)
    setError(null)
    try {
      setResults(await queryTaskData(searchFilters))
      setApplied(searchFilters)
      setExpanded(new Set())
    } catch (err) {
      setError(err.message ?? String(err))
    } finally {
      setLoading(false)
    }
  }

  const rows = useMemo(
    () => (results?.rows ?? []).map((r) => ({ ...r, summary: summarizeTask(r, results.questions) })),
    [results],
  )
  const tagList = useMemo(() => [...tagNames].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'zh-TW')), [tagNames])
  const questionFilterActive = !!(applied.difficulty || applied.tagId)

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
      `任務關卡摘要_${todayStamp()}.xlsx`,
      '摘要',
      rows.map(({ summary: s }) => ({
        日期: formatDateTime(s.date),
        用途: s.purpose,
        年級: s.grade,
        班級: s.className,
        座號: s.seat,
        姓名: s.name,
        主題: s.topic,
        題目難度: s.difficulty,
        作答題數: s.answered,
        答對題數: s.correct,
        答對率: s.rate,
        平均提示次數: s.avgHints,
        求助次數: s.helps,
        '總花費時間（分鐘）': s.minutes,
        是否完成: s.completed,
      })),
    )
  }

  function exportFullLogs() {
    const events = rows.flatMap(({ session, logs }) =>
      logs.map((l) => {
        const q = describeQuestion(results.questions.get(l.question_id), tagNames)
        return {
          日期: formatDateTime(session.started_at),
          用途: session.purpose,
          年級: session.grade,
          班級: session.class_name,
          座號: session.seat_number,
          姓名: session.student_name,
          主題: session.topic_name ?? '',
          時間戳: formatDateTime(l.created_at),
          題序: l.question_order ?? '',
          題目ID: l.question_id ?? '',
          題目難度: q.difficulty,
          題目標籤: q.tags,
          事件類型: EVENT_LABELS[l.event_type] ?? l.event_type,
          作答內容: l.answer_given ?? '',
          是否答對: l.is_correct === null ? '' : l.is_correct ? '是' : '否',
          本題花費秒數: l.time_spent_seconds ?? '',
          累計提示次數: l.hint_count,
        }
      }),
    )
    exportXlsx(`任務關卡完整Logs_${todayStamp()}.xlsx`, 'Logs', events)
  }

  async function handleDelete() {
    const uuids = confirm.kind === 'single' ? [confirm.row.session.session_uuid] : rows.map((r) => r.session.session_uuid)
    const count = uuids.length
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteTaskSessions(uuids)
      setConfirm(null)
      setNotice(confirm.kind === 'single' ? '已刪除 1 筆記錄' : `已刪除 ${count} 筆記錄`)
      await runSearch(applied)
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
      ? `確定要刪除 ${confirm.row.summary.name} 於 ${formatDateTime(confirm.row.summary.date)} 的 ${confirm.row.summary.topic} 學習記錄？此操作無法還原。`
      : `確定要刪除目前篩選結果中的所有 ${rows.length} 筆記錄？此操作無法還原。${
          questionFilterActive ? '（目前有難度／標籤篩選：每筆會整筆刪除，包含不符合篩選的題目紀錄。）' : ''
        }`

  return (
    <div className="min-h-screen bg-paper text-navy md:flex">
      <AdminNav active="task-logs" />
      <div className="flex-1 min-w-0 w-full px-6 py-8 flex flex-col gap-5">
        <h1 className="text-2xl font-bold">📊 任務關卡資料</h1>
        <LogFilterBar
          filters={filters}
          onChange={setFilters}
          topics={topics}
          tags={tagList}
          onSearch={() => {
            setNotice(null)
            runSearch(filters)
          }}
          loading={loading}
          nameHint="選了題目難度或標籤時，只會統計符合條件的題目，並只列出做過這些題目的學生。"
        />

        {error && <p className="text-red-600">查詢失敗：{error}</p>}
        {notice && <p className="text-green-700 font-bold">{notice}</p>}
        {results === null && !loading && <p className="text-slate-500">請設定查詢條件後按「查詢」。</p>}

        {results !== null && (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-slate-600">共 {rows.length} 筆 session</span>
              <button
                type="button"
                disabled={!canExport}
                onClick={exportSummary}
                className="bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-40 rounded-lg px-4 py-2 text-sm font-bold"
              >
                匯出摘要 Excel
              </button>
              <button
                type="button"
                disabled={!canExport}
                onClick={exportFullLogs}
                className="bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-40 rounded-lg px-4 py-2 text-sm font-bold"
              >
                匯出完整 Logs Excel
              </button>
              <button
                type="button"
                disabled={!canExport}
                onClick={() => {
                  setDeleteError(null)
                  setConfirm({ kind: 'batch' })
                }}
                className="bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 disabled:opacity-40 rounded-lg px-4 py-2 text-sm font-bold ml-auto"
              >
                🗑️ 批次刪除
              </button>
            </div>

            <div className="overflow-x-auto bg-white rounded-2xl border border-slate-200 shadow-sm">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-slate-200">
                    {COLUMNS.map((h, i) => (
                      <th key={h || `action-${i}`} className={TH}>
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
                  {rows.map((row) => {
                    const { session, logs, summary: s } = row
                    const open = expanded.has(session.session_uuid)
                    return (
                      <Fragment key={session.session_uuid}>
                        <tr className="border-b border-slate-100">
                          <td className={TD}>{formatDateTime(s.date)}</td>
                          <td className={TD}>{s.purpose}</td>
                          <td className={TD}>{s.grade}</td>
                          <td className={TD}>{s.className}</td>
                          <td className={TD}>{s.seat}</td>
                          <td className={`${TD} font-bold`}>{s.name}</td>
                          <td className={TD}>{s.topic}</td>
                          <td className={TD}>{s.difficulty}</td>
                          <td className={TD}>{s.answered}</td>
                          <td className={TD}>{s.correct}</td>
                          <td className={TD}>{s.rate}</td>
                          <td className={TD}>{s.avgHints}</td>
                          <td className={TD}>{s.helps}</td>
                          <td className={TD}>{s.minutes}</td>
                          <td className={TD}>{s.completed}</td>
                          <td className={TD}>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => toggle(session.session_uuid)}
                                className="bg-slate-100 hover:bg-slate-200 rounded-lg px-3 py-1 text-sm"
                              >
                                {open ? '收合' : '展開'}
                              </button>
                              <button
                                type="button"
                                title="刪除這筆記錄"
                                aria-label={`刪除 ${s.name} 的學習記錄`}
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
                              {logs.length === 0 ? (
                                <p className="text-slate-400 text-sm">這次沒有任何操作紀錄</p>
                              ) : (
                                <table className="border-collapse text-sm">
                                  <thead>
                                    <tr>
                                      {['時間戳', '題目編號', '難度', '事件類型', '作答內容', '本題花費秒數'].map((h) => (
                                        <th key={h} className={TH}>
                                          {h}
                                        </th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {logs.map((l) => (
                                      <tr key={l.id} className="border-t border-slate-200">
                                        <td className={TD}>{formatDateTime(l.created_at)}</td>
                                        <td className={TD}>{l.question_order ? `第 ${l.question_order} 題` : '—'}</td>
                                        <td className={TD}>{describeQuestion(results.questions.get(l.question_id), tagNames).difficulty || '—'}</td>
                                        <td className={TD}>{EVENT_LABELS[l.event_type] ?? l.event_type}</td>
                                        <td className={TD}>{l.answer_given ?? ''}</td>
                                        <td className={TD}>{l.time_spent_seconds ?? ''}</td>
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
          </>
        )}
      </div>

      {confirm && (
        <ConfirmDialog
          title={confirm.kind === 'batch' ? '批次刪除' : '刪除學習記錄'}
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
