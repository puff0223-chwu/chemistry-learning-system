import assert from 'node:assert/strict'
import { analyzeStuck, buildNames, describeMissionEvent, summarizeMissionSession } from '../src/lib/missionStats.js'

let passed = 0
function test(name, fn) {
  try {
    fn()
    passed++
  } catch (err) {
    console.error(`FAIL ${name}\n`, err)
    process.exitCode = 1
  }
}

const data = {
  stages: [
    {
      stageId: 's1',
      title: '第一關',
      objectives: [{ objectiveId: 'o1', text: '找到鑰匙' }],
      scenes: [{ sceneId: 'sc1', name: '實驗室', objects: [{ id: 'L1', name: '保險箱', type: 'lock' }, { id: 'B1', name: '燒杯', type: 'image' }] }],
    },
  ],
}
const names = buildNames(data)
const session = { session_uuid: 'u1', started_at: '2026-01-01T00:00:00Z', student_name: '小明', mission_id: 'm1', mission_version: 2 }
const log = (seq, event_type, extra = {}) => ({ seq, event_type, stage_id: 's1', scene_id: 'sc1', block_id: null, payload: null, ...extra })

const logs1 = [
  log(0, 'mission_start'),
  log(1, 'lock_attempt', { block_id: 'L1', payload: { answer: 'A', correct: false, attempt: 1 } }),
  log(2, 'lock_attempt', { block_id: 'L1', payload: { answer: 'B', correct: false, attempt: 2 } }),
  log(3, 'hint_shown', { block_id: 'L1', payload: { level: 1, auto: false } }),
  log(4, 'lock_attempt', { block_id: 'L1', payload: { answer: 'C', correct: true, attempt: 3 } }),
  log(5, 'lock_solved', { block_id: 'L1', payload: { attempts: 3, hints: 1, afterGiveUp: false } }),
  log(6, 'objective_done', { payload: { objectiveId: 'o1', text: '找到鑰匙' } }),
  log(7, 'stage_complete', { payload: { seconds: 120, title: '第一關' } }),
  log(8, 'mission_complete', { payload: { seconds: 150 } }),
]
const logs2 = [
  log(0, 'mission_start'),
  log(1, 'lock_attempt', { block_id: 'L1', payload: { answer: 'A', correct: false, attempt: 1 } }),
  log(2, 'give_up', { block_id: 'L1', payload: { attempts: 1 } }),
  log(3, 'hint_shown', { block_id: 'o1', payload: { objectiveId: 'o1', level: 1 } }),
  log(4, 'mission_quit'),
]

test('buildNames maps ids to teacher words', () => {
  assert.equal(names.stages.get('s1'), '第一關')
  assert.equal(names.locks.get('L1').name, '保險箱')
  assert.equal(names.locks.has('B1'), false)
  assert.equal(names.objectives.get('o1'), '找到鑰匙')
})

test('summary counts attempts, wrong, hints and completion', () => {
  const s = summarizeMissionSession({ session, logs: logs1 }, () => '化學任務')
  assert.equal(s.attempts, 3)
  assert.equal(s.wrong, 2)
  assert.equal(s.hints, 1)
  assert.equal(s.stagesDone, 1)
  assert.equal(s.seconds, 150)
  assert.equal(s.minutes, '2.5')
  assert.equal(s.status, '完成')
  assert.equal(s.mission, '化學任務')
})

test('summary of an unfinished, quit session', () => {
  const s = summarizeMissionSession({ session, logs: logs2 })
  assert.equal(s.status, '中途離開')
  assert.equal(s.giveUps, 1)
  assert.equal(s.seconds, 0)
  assert.equal(s.completed, false)
})

test('summary falls back to stage seconds when mission is not complete', () => {
  const s = summarizeMissionSession({ session, logs: [log(0, 'stage_complete', { payload: { seconds: 60 } }), log(1, 'stage_complete', { stage_id: 's2', payload: { seconds: 30 } })] })
  assert.equal(s.seconds, 90)
  assert.equal(s.stagesDone, 2)
})

test('summary tolerates logs arriving out of order', () => {
  const s = summarizeMissionSession({ session, logs: [...logs1].reverse() })
  assert.equal(s.attempts, 3)
})

test('stuck analysis ranks the lock where students give up first', () => {
  const rows = [{ session, logs: logs1 }, { session: { ...session, session_uuid: 'u2' }, logs: logs2 }]
  const r = analyzeStuck(rows, names)
  assert.equal(r.total, 2)
  assert.equal(r.locks.length, 1)
  const L = r.locks[0]
  assert.equal(L.name, '保險箱')
  assert.equal(L.students, 2)
  assert.equal(L.attempts, 4)
  assert.equal(L.wrong, 3)
  assert.equal(L.wrongRate, '75%')
  assert.equal(L.wrongStudents, 2)
  assert.equal(L.avgAttempts, 3)
  assert.equal(L.solved, 1)
  assert.equal(L.giveUps, 1)
  assert.equal(L.hints, 1)
  assert.equal(L.where, '第一關／實驗室')
})

test('objective stats count students who finished and hints asked', () => {
  const rows = [{ session, logs: logs1 }, { session: { ...session, session_uuid: 'u2' }, logs: logs2 }]
  const o = analyzeStuck(rows, names).objectives[0]
  assert.equal(o.text, '找到鑰匙')
  assert.equal(o.done, 1)
  assert.equal(o.doneRate, '50%')
  assert.equal(o.hints, 1)
})

test('empty input gives empty analysis', () => {
  const r = analyzeStuck([], names)
  assert.deepEqual([r.locks, r.objectives, r.total], [[], [], 0])
})

test('event descriptions are readable and survive deleted objects', () => {
  assert.match(describeMissionEvent(logs1[1], names), /保險箱：「A」❌ 答錯（第 1 次）/)
  assert.match(describeMissionEvent(logs1[5], names), /共答 3 次/)
  assert.match(describeMissionEvent(log(9, 'give_up', { block_id: 'gone', payload: { attempts: 2 } }), names), /已刪除的物件/)
  assert.match(describeMissionEvent(logs2[3], names), /找到鑰匙.*第 1 個提示/)
})

console.log(`${passed} passed`)
