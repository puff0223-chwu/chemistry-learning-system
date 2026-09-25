import { Fragment, useEffect, useMemo, useState } from 'react'
import AdminNav from '../components/AdminNav.jsx'
import LogFilterBar from '../components/LogFilterBar.jsx'
import { supabase } from '../lib/supabase.js'
import { exportXlsx, todayStamp } from '../lib/exportExcel.js'
import {
  EMPTY_FILTERS,
  WINNER_LABELS,
  formatDateTime,
  playerText,
  queryBattleData,
  summarizeBattle,
} from '../lib/logQueries.js'

const TH = 'py-2 px-3 text-left whitespace-nowrap font-bold text-slate-500 text-sm'
const TD = 'py-2 px-3 whitespace-nowrap'
const yesNo = (v) => (v === null || v === undefined ? '' : v ? '是' : '否')
const snippet = (text) => (text ? (text.length > 30 ? `${text.slice(0, 30)}…` : text) : '（題目已刪除）')

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
  const [topics, setTopics] = useState([])
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [expanded, setExpanded] = useState(() => new Set())

  useEffect(() => {
    supabase
      .from('topics')
      .select('id, name')
      .order('created_at', { ascending: true })
      .then(({ data }) => setTopics(data ?? []))
  }, [])

  async function handleSearch() {
    setLoading(true)
    setError(null)
    try {
      setResults(await queryBattleData(filters))
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
      battle.rounds.map((r) => ({
        日期: formatDateTime(s.date),
        用途: s.purpose,
        主題: s.topic,
        ...playerColumns('玩家A', s.playerA),
        ...playerColumns('玩家B', s.playerB),
        題序: r.question_order ?? '',
        題目ID: r.question_id ?? '',
        題目內容: r.questionContent ?? '',
        A的作答: r.player_a_answer ?? '',
        A是否答對: yesNo(r.player_a_correct),
        A答題秒數: r.player_a_time_seconds ?? '',
        B的作答: r.player_b_answer ?? '',
        B是否答對: yesNo(r.player_b_correct),
        B答題秒數: r.player_b_time_seconds ?? '',
        本題勝者: WINNER_LABELS[r.winner] ?? r.winner ?? '',
        扣血後A血量: r.player_a_hp_after ?? '',
        扣血後B血量: r.player_b_hp_after ?? '',
      })),
    )
    exportXlsx(`對戰完整Logs_${todayStamp()}.xlsx`, 'Logs', events)
  }

  const canExport = rows.length > 0

  return (
    <div className="min-h-screen bg-paper text-navy md:flex">
      <AdminNav active="battle-logs" />
      <div className="flex-1 min-w-0 w-full px-6 py-8 flex flex-col gap-5">
        <h1 className="text-2xl font-bold">📊 對戰資料</h1>
        <LogFilterBar
          filters={filters}
          onChange={setFilters}
          topics={topics}
          onSearch={handleSearch}
          loading={loading}
          nameHint="年級、班級、姓名的條件只要玩家 A 或 B 任一方符合，該場對戰就會列出。"
        />

        {error && <p className="text-red-600">查詢失敗：{error}</p>}
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
            </div>

            <div className="overflow-x-auto bg-white rounded-2xl border border-slate-200 shadow-sm">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-slate-200">
                    {['日期', '用途', '主題', '玩家 A', '玩家 B', '總題數', 'A 答對（率）', 'B 答對（率）', 'A 最終血量', 'B 最終血量', '勝者', ''].map(
                      (h) => (
                        <th key={h || 'action'} className={TH}>
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={12} className="py-8 text-center text-slate-400">
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
                            <button
                              type="button"
                              onClick={() => toggle(battle.uuid)}
                              className="bg-slate-100 hover:bg-slate-200 rounded-lg px-3 py-1 text-sm"
                            >
                              {open ? '收合' : '展開'}
                            </button>
                          </td>
                        </tr>
                        {open && (
                          <tr className="border-b border-slate-100 bg-slate-50">
                            <td colSpan={12} className="px-6 py-3">
                              {battle.rounds.length === 0 ? (
                                <p className="text-slate-400 text-sm">這場對戰沒有任何題目紀錄</p>
                              ) : (
                                <table className="border-collapse text-sm">
                                  <thead>
                                    <tr>
                                      {['題序', '題目內容', 'A 的作答', 'A 答對', 'A 秒數', 'B 的作答', 'B 答對', 'B 秒數', '本題勝者', 'A 血量', 'B 血量'].map(
                                        (h) => (
                                          <th key={h} className={TH}>
                                            {h}
                                          </th>
                                        ),
                                      )}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {battle.rounds.map((r) => (
                                      <tr key={r.id} className="border-t border-slate-200">
                                        <td className={TD}>{r.question_order}</td>
                                        <td className={TD}>{snippet(r.questionContent)}</td>
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
    </div>
  )
}
