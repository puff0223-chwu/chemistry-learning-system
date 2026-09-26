import { supabase } from './supabase.js'

const PAGE = 1000 // Supabase returns at most 1000 rows per request
const IN_CHUNK = 50 // uuids per `in (...)` filter, to keep request URLs short

export const EMPTY_FILTERS = {
  startDate: '',
  endDate: '',
  purpose: '',
  grade: '',
  className: '',
  topicId: '',
  studentName: '',
  difficulty: '',
  tagId: '',
}

export const EVENT_LABELS = {
  answer_correct: '答對',
  answer_wrong: '答錯',
  hint_1_shown: '顯示提示一',
  hint_2_shown: '顯示提示二',
  hint_3_shown: '顯示提示三',
  help_requested: '求助（我真的不會）',
  question_skipped: '跳過',
  topic_complete: '完成主題',
}

export const WINNER_LABELS = { A: '玩家 A', B: '玩家 B', draw: '平手', both_wrong: '雙方答錯', timeout: '時間到' }

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

async function fetchAllRows(build) {
  const rows = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1)
    if (error) throw error
    rows.push(...data)
    if (data.length < PAGE) break
  }
  return rows
}

async function fetchByChunks(values, build) {
  const results = await Promise.all(chunk(values, IN_CHUNK).map((part) => fetchAllRows(() => build(part))))
  return results.flat()
}

const escapeLike = (text) => text.trim().replace(/[\\%_]/g, (c) => `\\${c}`)

function applySessionFilters(query, filters) {
  let q = query
  if (filters.startDate) q = q.gte('started_at', new Date(`${filters.startDate}T00:00:00`).toISOString())
  if (filters.endDate) q = q.lte('started_at', new Date(`${filters.endDate}T23:59:59.999`).toISOString())
  if (filters.purpose) q = q.eq('purpose', filters.purpose)
  if (filters.grade) q = q.eq('grade', filters.grade)
  if (filters.className.trim()) q = q.ilike('class_name', `%${escapeLike(filters.className)}%`)
  if (filters.topicId) q = q.eq('topic_id', filters.topicId)
  if (filters.studentName.trim()) q = q.ilike('student_name', `%${escapeLike(filters.studentName)}%`)
  return q
}

function querySessions(mode, filters) {
  return fetchAllRows(() =>
    applySessionFilters(supabase.from('student_sessions').select('*').eq('mode', mode), filters)
      .order('started_at', { ascending: false })
      .order('id', { ascending: true }),
  )
}

// Difficulty / tags live on questions; logs only carry question_id, so they're looked up separately.
async function fetchQuestionInfo(ids, select = 'id, difficulty, content_tag_ids') {
  const unique = [...new Set(ids.filter(Boolean))]
  const rows = await fetchByChunks(unique, (part) =>
    supabase.from('questions').select(select).in('id', part).order('id', { ascending: true }),
  )
  return new Map(rows.map((q) => [q.id, q]))
}

function matchesQuestionFilters(question, filters) {
  if (filters.difficulty && question?.difficulty !== filters.difficulty) return false
  if (filters.tagId && !(question?.content_tag_ids ?? []).includes(Number(filters.tagId))) return false
  return true
}

export async function tagNameMap() {
  const { data } = await supabase.from('tags').select('id, name')
  return new Map((data ?? []).map((t) => [t.id, t.name]))
}

// Difficulty and tag names for one question, as shown in the reports and exported to Excel.
export function describeQuestion(question, tagNames) {
  return {
    difficulty: question?.difficulty ?? '',
    tags: (question?.content_tag_ids ?? []).map((id) => tagNames.get(id)).filter(Boolean).join(', '),
  }
}

// Resolves to { rows: [{ session, logs }], questions: Map(question id -> question) }.
// With a difficulty/tag filter, only sessions that touched matching questions are listed, and their
// summary is computed from the matching questions' events (plus topic_complete, which is per session).
export async function queryTaskData(filters) {
  const sessions = await querySessions('task', filters)
  const logs = await fetchByChunks(
    sessions.map((s) => s.session_uuid),
    (part) =>
      supabase
        .from('task_logs')
        .select('*')
        .in('session_uuid', part)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true }),
  )
  const logsBySession = new Map()
  for (const log of logs) {
    if (!logsBySession.has(log.session_uuid)) logsBySession.set(log.session_uuid, [])
    logsBySession.get(log.session_uuid).push(log)
  }
  const questions = await fetchQuestionInfo(logs.map((l) => l.question_id))

  const filtering = !!(filters.difficulty || filters.tagId)
  const rows = []
  for (const session of sessions) {
    let sessionLogs = logsBySession.get(session.session_uuid) ?? []
    if (filtering) {
      sessionLogs = sessionLogs.filter((l) =>
        l.question_id == null ? l.event_type === 'topic_complete' : matchesQuestionFilters(questions.get(l.question_id), filters),
      )
      if (!sessionLogs.some((l) => l.question_id != null)) continue
    }
    rows.push({ session, logs: sessionLogs })
  }
  return { rows, questions }
}

// One row per battle. The filters match individual players; a battle is listed if either player matches.
export async function queryBattleData(filters) {
  const matched = await querySessions('battle', filters)
  const battleUuids = [...new Set(matched.map((s) => s.battle_session_uuid).filter(Boolean))]

  const [sessions, logs] = await Promise.all([
    fetchByChunks(battleUuids, (part) =>
      supabase.from('student_sessions').select('*').in('battle_session_uuid', part).order('id', { ascending: true }),
    ),
    fetchByChunks(battleUuids, (part) =>
      supabase.from('battle_logs').select('*').in('battle_session_uuid', part).order('id', { ascending: true }),
    ),
  ])

  const questions = await fetchQuestionInfo(
    logs.map((l) => l.question_id),
    'id, content, difficulty, content_tag_ids',
  )

  const battles = battleUuids.map((uuid) => {
    const players = sessions.filter((s) => s.battle_session_uuid === uuid)
    const rounds = logs
      .filter((l) => l.battle_session_uuid === uuid)
      .sort((a, b) => (a.question_order ?? 0) - (b.question_order ?? 0))
      .map((l) => ({
        ...l,
        questionContent: questions.get(l.question_id)?.content ?? null,
        question: questions.get(l.question_id) ?? null,
      }))
    return {
      uuid,
      playerA: players.find((p) => p.player_role === 'A') ?? null,
      playerB: players.find((p) => p.player_role === 'B') ?? null,
      rounds,
    }
  })
  // A difficulty filter keeps whole battles that contain at least one matching question
  // (cutting rounds out would distort the totals and the final HP).
  const kept = filters.difficulty
    ? battles.filter((b) => b.rounds.some((r) => r.question?.difficulty === filters.difficulty))
    : battles
  return kept.sort((a, b) => startedAt(b).localeCompare(startedAt(a)))
}

function startedAt(battle) {
  return battle.playerA?.started_at ?? battle.playerB?.started_at ?? ''
}

// ---------- summaries (calculated in the browser) ----------

const pct = (part, whole) => (whole ? `${Math.round((part / whole) * 1000) / 10}%` : '—')

export function summarizeTask({ session, logs }, questions = new Map()) {
  const questionKey = (l) => l.question_order ?? l.question_id
  const difficulties = new Set(
    logs.filter((l) => l.question_id != null).map((l) => questions.get(l.question_id)?.difficulty ?? '未設定'),
  )
  const difficulty = difficulties.size === 0 ? '—' : difficulties.size === 1 ? [...difficulties][0] : '混合'
  const answered = new Set(
    logs.filter((l) => l.event_type.startsWith('answer_') || l.event_type === 'help_requested').map(questionKey),
  )
  const correct = new Set(logs.filter((l) => l.event_type === 'answer_correct').map(questionKey))
  const hints = logs.filter((l) => /^hint_\d_shown$/.test(l.event_type)).length
  const helps = logs.filter((l) => l.event_type === 'help_requested').length
  const seconds = logs.reduce((sum, l) => sum + (l.time_spent_seconds ?? 0), 0)
  return {
    date: session.started_at,
    purpose: session.purpose,
    grade: session.grade,
    className: session.class_name,
    seat: session.seat_number,
    name: session.student_name,
    topic: session.topic_name ?? '（已刪除的主題）',
    difficulty,
    answered: answered.size,
    correct: correct.size,
    rate: pct(correct.size, answered.size),
    avgHints: answered.size ? (hints / answered.size).toFixed(2) : '—',
    helps,
    minutes: (seconds / 60).toFixed(1),
    completed: logs.some((l) => l.event_type === 'topic_complete') ? '完成' : '未完成',
  }
}

export function summarizeBattle(battle) {
  const { playerA, playerB, rounds } = battle
  const last = rounds[rounds.length - 1]
  const total = rounds.length
  const correctA = rounds.filter((r) => r.player_a_correct).length
  const correctB = rounds.filter((r) => r.player_b_correct).length
  let winner = '—'
  if (last) {
    if (last.player_a_hp_after > last.player_b_hp_after) winner = 'A'
    else if (last.player_a_hp_after < last.player_b_hp_after) winner = 'B'
    else winner = '平手'
  }
  const ref = playerA ?? playerB
  return {
    date: ref?.started_at ?? '',
    purpose: ref?.purpose ?? '',
    topic: ref?.topic_name ?? '（已刪除的主題）',
    playerA,
    playerB,
    total,
    correctA,
    correctB,
    rateA: pct(correctA, total),
    rateB: pct(correctB, total),
    hpA: last ? last.player_a_hp_after : '—',
    hpB: last ? last.player_b_hp_after : '—',
    winner,
  }
}

export function formatDateTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('zh-TW', { hour12: false })
}

export const playerText = (p) => (p ? `${p.grade} ${p.class_name} ${p.seat_number}號 ${p.student_name}` : '（缺少資料）')

// ---------- deletion ----------
// Deleting student_sessions is enough: task_logs / battle_logs reference them ON DELETE CASCADE.

async function deleteSessionsWhere(column, values) {
  let deleted = 0
  for (const part of chunk(values, IN_CHUNK)) {
    const { data, error } = await supabase.from('student_sessions').delete().in(column, part).select('id')
    if (error) throw error
    deleted += data.length
  }
  return deleted
}

export const deleteTaskSessions = (sessionUuids) => deleteSessionsWhere('session_uuid', sessionUuids)

// Both players' sessions of a battle share one battle_session_uuid.
export const deleteBattles = (battleUuids) => deleteSessionsWhere('battle_session_uuid', battleUuids)
