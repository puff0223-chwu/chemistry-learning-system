import { Fragment, useEffect, useMemo, useState } from 'react'
import AdminNav from '../components/AdminNav.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import LogFilterBar from '../components/LogFilterBar.jsx'
import { supabase } from '../lib/supabase.js'
import { exportXlsx, todayStamp } from '../lib/exportExcel.js'
import { htmlToText, truncate } from '../lib/richText.js'
import {
  EMPTY_FILTERS,
  WINNER_LABELS,
  deleteBattles,
  describeQuestion,
  formatDateTime,
  playerText,
  queryBattleData,
  summarizeBattle,
  tagNameMap,
} from '../lib/logQueries.js'

const TH = 'py-2 px-3 text-left whitespace-nowrap font-bold text-slate-500 text-sm'
const TD = 'py-2 px-3 whitespace-nowrap'
const COLUMNS = ['日期', '用途', '主題', '玩家 A', '玩家 B', '總題數', 'A 答對（率）', 'B 答對（率）', 'A 最終血量', 'B 最終血量', '勝者', '']
const yesNo = (v) => (v === null || v === undefined ? '' : v ? '是' : '否')
const snippet = (html) => (html ? truncate(htmlToText(html), 30) : '（題目已刪除）')

function playerColumns(prefix, p) {
  return {
    [`${prefix}年級`]: p?.grade ?? '',
    [`${prefix}班級`]: p?.class_name ?? '',
    [`${prefix}座號`]: p?.seat_number ?? '',
    [`${prefix}姓名`]: p?.student_name ?? '',
  }
}

export default function AdminBattleLogs() {
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [applied, setApplied] = useState(EMPTY_FILTERS)
  const [topics, setTopics] = useState([])
  const [tagNames, setTagNames] = useState(() => new Map())
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [expanded, setExpanded] = useState(() => new Set())
  const [confirm, setConfirm] = useState(null) // { kind: 'single', battle, summary } | { kind: 'batch' }
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
      setResults(await queryBattleData(searchFilters))
      setApplied(searchFilters)
      setExpanded(new Set())
    } catch (err) {
      setError(err.message ?? String(err))
    } finally {
      setLoading(false)
    }
  }

  const rows = useMemo(() => (results ?? []).map((b) => ({ battle: b, summary: summarizeBattle(b) })), [results])

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
      `對戰摘要_${todayStamp()}.xlsx`,
      '摘要',
      rows.map(({ summary: s }) => ({
        日期: formatDateTime(s.date),
        用途: s.purpose,
        主題: s.topic,
        ...playerColumns('玩家A', s.playerA),
        ...playerColumns('玩家B', s.playerB),
        總題數: s.total,
        A答對題數: s.correctA,
        A答對率: s.rateA,
        B答對題數: s.correctB,
        B答對率: s.rateB,
        A最終血量: s.hpA,
        B最終血量: s.hpB,
        勝者: s.winner,
      })),
    )
  }

  function exportFullLogs() {
    const events = rows.flatMap(({ battle, summary: s }) =>
      battle.rounds.map((r) => {
        const q = describeQuestion(r.question, tagNames)
        return {
          日期: formatDateTime(s.date),
          用途: s.purpose,
          主題: s.topic,
          ...playerColumns('玩家A', s.playerA),
          ...playerColumns('玩家B', s.playerB),
          題序: r.question_order ?? '',
          題目ID: r.question_id ?? '',
          題目難度: q.difficulty,
          題目標籤: q.tags,
          題目內容: r.questionContent ? htmlToText(r.questionContent) : '',
          A的作答: r.player_a_answer ?? '',
          A是否答對: yesNo(r.player_a_correct),
          A答題秒數: r.player_a_time_seconds ?? '',
          B的作答: r.player_b_answer ?? '',
          B是否答對: yesNo(r.player_b_correct),
          B答題秒數: r.player_b_time_seconds ?? '',
          本題勝者: WINNER_LABELS[r.winner] ?? r.winner ?? '',
          扣血後A血量: r.player_a_hp_after ?? '',
          扣血後B血量: r.player_b_hp_after ?? '',
        }
      }),
    )
    exportXlsx(`對戰完整Logs_${todayStamp()}.xlsx`, 'Logs', events)
  }

  async function handleDelete() {
    const uuids = confirm.kind === 'single' ? [confirm.battle.uuid] : rows.map((r) => r.battle.uuid)
    const count = uuids.length
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteBattles(uuids)
      setConfirm(null)
      setNotice(`已刪除 ${count} 筆記錄`)
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
      ? `確定要刪除這場 ${formatDateTime(confirm.summary.date)} 的 ${confirm.summary.topic} 對戰記錄？此操作無法還原。`
      : `確定要刪除目前篩選結果中的所有 ${rows.length} 筆記錄？此操作無法還原。`

  return (
    <div className="min-h-screen bg-paper text-navy md:flex">
      <AdminNav active="battle-logs" />
      <div className="flex-1 min-w-0 w-full px-6 py-8 flex flex-col gap-5">
        <h1 className="text-2xl font-bold">📊 對戰資料</h1>
        <LogFilterBar
          filters={filters}
          onChange={setFilters}
          topics={topics}
          onSearch={() => {
            setNotice(null)
            runSearch(filters)
          }}
          loading={loading}
          nameHint="年級、班級、姓名的條件只要玩家 A 或 B 任一方符合，該場對戰就會列出；題目難度則是整場中出現過該難度的題目就列出（整場資料不會被截斷）。"
        />

        {error && <p className="text-red-600">查詢失敗：{error}</p>}
        {notice && <p className="text-green-700 font-bold">{notice}</p>}
        {results === null && !loading && <p className="text-slate-500">請設定查詢條件後按「查詢」。</p>}

        {results !== null && (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-slate-600">共 {rows.length} 場對戰</span>
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
                  {rows.map(({ battle, summary: s }) => {
                    const open = expanded.has(battle.uuid)
                    return (
                      <Fragment key={battle.uuid}>
                        <tr className="border-b border-slate-100">
                          <td className={TD}>{formatDateTime(s.date)}</td>
                          <td className={TD}>{s.purpose}</td>
                          <td className={TD}>{s.topic}</td>
                          <td className={TD}>{playerText(s.playerA)}</td>
                          <td className={TD}>{playerText(s.playerB)}</td>
                          <td className={TD}>{s.total}</td>
                          <td className={TD}>
                            {s.correctA}（{s.rateA}）
                          </td>
                          <td className={TD}>
                            {s.correctB}（{s.rateB}）
                          </td>
                          <td className={TD}>{s.hpA}</td>
                          <td className={TD}>{s.hpB}</td>
                          <td className={`${TD} font-bold`}>{s.winner}</td>
                          <td className={TD}>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => toggle(battle.uuid)}
                                className="bg-slate-100 hover:bg-slate-200 rounded-lg px-3 py-1 text-sm"
                              >
                                {open ? '收合' : '展開'}
                              </button>
                              <button
                                type="button"
                                title="刪除這場對戰記錄"
                                aria-label="刪除這場對戰記錄"
                                onClick={() => {
                                  setDeleteError(null)
                                  setConfirm({ kind: 'single', battle, summary: s })
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
                              {battle.rounds.length === 0 ? (
                                <p className="text-slate-400 text-sm">這場對戰沒有任何題目紀錄</p>
                              ) : (
                                <table className="border-collapse text-sm">
                                  <thead>
                                    <tr>
                                      {['題序', '題目內容', '難度', 'A 的作答', 'A 答對', 'A 秒數', 'B 的作答', 'B 答對', 'B 秒數', '本題勝者', 'A 血量', 'B 血量'].map((h) => (
                                        <th key={h} className={TH}>
                                          {h}
                                        </th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {battle.rounds.map((r) => (
                                      <tr key={r.id} className="border-t border-slate-200">
                                        <td className={TD}>{r.question_order}</td>
                                        <td className={TD}>{snippet(r.questionContent)}</td>
                                        <td className={TD}>{r.question?.difficulty ?? '—'}</td>
                                        <td className={TD}>{r.player_a_answer ?? '未作答'}</td>
                                        <td className={TD}>{yesNo(r.player_a_correct)}</td>
                                        <td className={TD}>{r.player_a_time_seconds ?? ''}</td>
                                        <td className={TD}>{r.player_b_answer ?? '未作答'}</td>
                                        <td className={TD}>{yesNo(r.player_b_correct)}</td>
                                        <td className={TD}>{r.player_b_time_seconds ?? ''}</td>
                                        <td className={TD}>{WINNER_LABELS[r.winner] ?? r.winner}</td>
                                        <td className={TD}>{r.player_a_hp_after}</td>
                                        <td className={TD}>{r.player_b_hp_after}</td>
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
          title={confirm.kind === 'batch' ? '批次刪除' : '刪除對戰記錄'}
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
