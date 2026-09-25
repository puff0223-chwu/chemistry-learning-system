import { supabase } from './supabase.js'

// Logging is fire-and-forget: nothing here is awaited by the UI, and failures only reach the console.
// Log rows reference student_sessions, so each insert waits for its session's insert to finish first.
const sessionInserts = new Map() // session uuid -> Promise<boolean> (true = session row exists)

function report(what, err) {
  console.error(`[logs] ${what} 寫入失敗：`, err?.message ?? err)
}

export function newUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0'))
  return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h.slice(8, 10).join('')}-${h.slice(10).join('')}`
}

// Creates a student_sessions row and returns its uuid immediately (generated client-side, since
// students may not read rows back).
export function createStudentSession({ mode, purpose, student, topic, playerRole = null, battleSessionUuid = null }) {
  const sessionUuid = newUuid()
  const row = {
    session_uuid: sessionUuid,
    mode,
    purpose,
    grade: student.grade,
    class_name: student.className,
    seat_number: student.seatNumber,
    student_name: student.name,
    topic_id: topic?.id ?? null,
    topic_name: topic?.name ?? null,
    player_role: playerRole,
    battle_session_uuid: battleSessionUuid,
  }
  const inserted = Promise.resolve(supabase.from('student_sessions').insert(row)).then(
    ({ error }) => {
      if (error) {
        report('student_sessions', error)
        return false
      }
      return true
    },
    (err) => {
      report('student_sessions', err)
      return false
    },
  )
  sessionInserts.set(sessionUuid, inserted)
  return sessionUuid
}

function insertAfterSessions(table, row, sessionUuids) {
  Promise.all(sessionUuids.map((u) => sessionInserts.get(u) ?? Promise.resolve(false)))
    .then(async (results) => {
      if (results.some((ok) => !ok)) return
      const { error } = await supabase.from(table).insert(row)
      if (error) report(table, error)
    })
    .catch((err) => report(table, err))
}

export function logTaskEvent(sessionUuid, event) {
  if (!sessionUuid) return
  insertAfterSessions(
    'task_logs',
    {
      session_uuid: sessionUuid,
      question_id: event.questionId ?? null,
      question_order: event.questionOrder ?? null,
      event_type: event.eventType,
      answer_given: event.answerGiven ?? null,
      is_correct: event.isCorrect ?? null,
      time_spent_seconds: event.timeSpentSeconds ?? null,
      hint_count: event.hintCount ?? 0,
      created_at: new Date().toISOString(),
    },
    [sessionUuid],
  )
}

export function logBattleRound(round) {
  const { battleSessionUuid, sessionA, sessionB } = round
  if (!battleSessionUuid || !sessionA || !sessionB) return
  insertAfterSessions(
    'battle_logs',
    {
      battle_session_uuid: battleSessionUuid,
      question_id: round.questionId ?? null,
      question_order: round.questionOrder ?? null,
      player_a_session_uuid: sessionA,
      player_b_session_uuid: sessionB,
      player_a_answer: round.answerA ?? null,
      player_b_answer: round.answerB ?? null,
      player_a_correct: round.correctA,
      player_b_correct: round.correctB,
      player_a_time_seconds: round.timeA ?? null,
      player_b_time_seconds: round.timeB ?? null,
      player_a_hp_after: round.hpA,
      player_b_hp_after: round.hpB,
      winner: round.winner,
      created_at: new Date().toISOString(),
    },
    [sessionA, sessionB],
  )
}
