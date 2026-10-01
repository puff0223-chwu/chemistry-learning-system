import { get, set } from 'idb-keyval'
import { newUuid } from './logs.js'
import { supabase } from './supabase.js'

// Offline-safe queue for mission play records (spec-v5 §15.2). Events are written to IndexedDB first and sent
// in batches (every 5 s or 20 events). Network failures just leave them in the queue to retry; the unique key
// (session_id, seq) means a re-sent batch never creates duplicates.
const KEY = 'mission_queue_v1'
const FLUSH_MS = 5000
const BATCH = 20
const KEEP_MS = 7 * 24 * 3600 * 1000 // give up on rows older than a week (their session can no longer be saved)

const isNetworkError = (err) => !err?.code // PostgREST errors carry a code; a failed fetch does not

class MissionQueue {
  items = []
  ready = null
  flushing = false
  timer = null
  chain = Promise.resolve()

  init() {
    if (!this.ready) {
      this.ready = (async () => {
        // Rows from earlier page visits come first; anything pushed while we were loading stays after them.
        let stored = []
        try {
          stored = (await get(KEY)) ?? []
        } catch {
          // IndexedDB blocked (private window...): work in memory only
        }
        this.items = [...stored, ...this.items]
        if (this.items.length) this.persist()
        this.timer = setInterval(() => this.flush(), FLUSH_MS)
        window.addEventListener('online', () => this.flush())
        window.addEventListener('pagehide', () => this.flush())
        this.flush()
      })()
    }
    return this.ready
  }

  persist() {
    // Writes are chained so two quick pushes can never save out of order.
    this.chain = this.chain.then(() => set(KEY, this.items)).catch(() => {})
    return this.chain
  }

  push(kind, row) {
    this.items.push({ kind, row, ts: Date.now(), tries: 0 })
    this.persist()
    if (this.items.filter((i) => i.kind === 'log').length >= BATCH) this.flush()
  }

  remove(done) {
    this.items = this.items.filter((i) => !done.has(i))
    return this.persist()
  }

  async flush() {
    await this.init?.()
    if (this.flushing || this.items.length === 0) return
    this.flushing = true
    try {
      const expired = new Set(this.items.filter((i) => Date.now() - i.ts > KEEP_MS))
      if (expired.size) await this.remove(expired)

      // 1) sessions first: every log row points at one
      for (const item of this.items.filter((i) => i.kind === 'session')) {
        const { error } = await supabase.from('student_sessions').insert(item.row)
        if (error && isNetworkError(error)) return
        if (error && error.code !== '23505') console.error('[mission] 紀錄用的場次無法寫入，已放棄：', error.message)
        await this.remove(new Set([item])) // inserted, duplicate, or hopeless: either way it leaves the queue
      }

      // 2) then logs in batches, in order
      for (;;) {
        const batch = this.items.filter((i) => i.kind === 'log').slice(0, 50)
        if (batch.length === 0) break
        const { error } = await supabase.from('mission_logs').insert(batch.map((i) => i.row))
        if (!error) {
          await this.remove(new Set(batch))
          continue
        }
        if (isNetworkError(error)) return
        if (error.code === '23505') {
          // Some rows were already stored by an earlier attempt: send one by one, treating duplicates as done.
          const done = new Set()
          for (const item of batch) {
            const single = await supabase.from('mission_logs').insert(item.row)
            if (single.error && isNetworkError(single.error)) break
            if (!single.error || single.error.code === '23505') done.add(item)
          }
          await this.remove(done)
          if (done.size < batch.length) return
          continue
        }
        // e.g. foreign-key error while the session row is still missing: keep and retry later
        console.warn('[mission] 紀錄暫時無法寫入，稍後重試：', error.message)
        return
      }
    } finally {
      this.flushing = false
    }
  }
}

export const missionQueue = new MissionQueue()

// One play-through: gives out increasing sequence numbers and turns engine events into queued rows.
export function createMissionRecorder({ mission, version, student, startSeq = 0, sessionUuid = null }) {
  const sessionId = sessionUuid ?? newUuid()
  let seq = startSeq
  missionQueue.init()
  if (!sessionUuid) {
    missionQueue.push('session', {
      session_uuid: sessionId,
      mode: 'mission',
      purpose: student.purpose,
      grade: student.grade,
      class_name: student.className,
      seat_number: student.seatNumber,
      student_name: student.name,
      mission_id: mission.id,
      mission_version: version,
    })
  }
  return {
    sessionId,
    nextSeq: () => seq,
    log(eventType, { stageId, sceneId, blockId, payload } = {}) {
      seq += 1
      missionQueue.push('log', {
        session_id: sessionId,
        mission_id: mission.id,
        mission_version: version,
        stage_id: stageId ?? null,
        scene_id: sceneId ?? null,
        block_id: blockId ?? null,
        event_type: eventType,
        payload: payload ?? null,
        client_ts: new Date().toISOString(),
        seq,
      })
    },
  }
}
