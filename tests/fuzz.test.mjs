// 崩潰測試（亂數）：隨機產生各種「歪七扭八」的任務資料，丟進整條流程，要求任何情況都不當機。
// 同樣的種子（seed）結果一定相同，失敗時會印出種子，方便重現。  Run with: npm test
import assert from 'node:assert/strict'
import GameEngine from '../src/player/GameEngine.js'
import { checkMission } from '../src/lib/missionCheck.js'
import { collectFlags, completionSources, flagUsage, listSources, usesGoalCompletion } from '../src/lib/missionEvents.js'
import { protectMission, validateLock } from '../src/lib/lockLogic.js'
import { normalizeDraft } from '../src/lib/missionSchema.js'
import { DIRS, NASTY, build, rng } from './fuzz-data.mjs'
import { analyzeStuck, buildNames, describeMissionEvent, summarizeMissionSession } from '../src/lib/missionStats.js'

const quietUi = () => ({
  message: async () => {},
  intro: async () => {},
  lock: async () => {},
  closeLock: () => {},
  sound: () => {},
})

const INPUTS = ['', 'x', 123, null, undefined, [], ['a'], { a: 1 }, 'NaCl', 0, -1, ['up', 'down'], '😀']
async function play(mission, r, saved = null, steps = 40) {
  const pick = (list) => list[Math.floor(r() * list.length)]
  const engine = new GameEngine({ mission, ui: quietUi(), saved })
  await engine.start()
  const all = [...engine.objects.values()].map((x) => x.object)
  for (let i = 0; i < steps; i++) {
    const op = Math.floor(r() * 10)
    if (op === 0 && all.length) await engine.clickObject(pick(all))
    else if (op === 1) await engine.tryExit(pick(DIRS))
    else if (op === 2 && all.length) await engine.submitLock(pick(all).id, pick(INPUTS))
    else if (op === 3 && all.length) engine.requestHint(pick(all).id)
    else if (op === 4 && all.length) await engine.giveUp(pick(all).id)
    else if (op === 5 && mission.stages.length) await engine.enterStage(pick(mission.stages).stageId)
    else if (op === 6) engine.leaveStage()
    else if (op === 7) await engine.setFlag(pick(['記號A', '記號B', '']), r() < 0.5)
    else if (op === 8 && engine.currentObjectives) {
      const goals = engine.currentObjectives()
      if (goals.length) engine.requestObjectiveHint(pick(goals).objective?.objectiveId ?? goals[0].objectiveId)
    } else if (op === 9) engine.stageCards()
    engine.view()
    engine.scene()
    JSON.stringify(engine.serialize())
  }
  const saved2 = JSON.parse(JSON.stringify(engine.serialize()))
  engine.destroy()
  return saved2
}

let passed = 0
let failed = 0
async function trial(name, seed, fn) {
  try {
    await fn()
    passed++
  } catch (err) {
    failed++
    process.exitCode = 1
    console.log(`  FAIL ${name} (seed ${seed}): ${err.stack?.split('\n').slice(0, 4).join(' | ')}`)
  }
}

const SEEDS = Array.from({ length: 150 }, (_, i) => 1000 + i)

console.log('fuzz: whole pipeline on random broken missions')
for (const seed of SEEDS) {
  await trial('pipeline', seed, async () => {
    const raw = build(seed)
    const draft = normalizeDraft(JSON.parse(JSON.stringify(raw)))
    const assets = new Set(Math.random() < 2 ? [] : ['x'])
    // ids must be unique after loading, even when the file had two stages / scenes / objects with the same id
    for (const pick of [(d) => d.stages.map((st) => st.stageId), (d) => d.stages.flatMap((st) => st.scenes.map((sc) => sc.sceneId)), (d) => d.stages.flatMap((st) => st.scenes.flatMap((sc) => sc.objects.map((o) => o.id)))]) {
      const ids = pick(draft)
      assert.equal(new Set(ids).size, ids.length, 'duplicate ids after normalizeDraft')
    }
    const report = checkMission(draft, assets)
    assert.equal(report.errors.length, report.errorWhere.length)
    assert.equal(report.warnings.length, report.warningWhere.length)
    collectFlags(draft)
    flagUsage(draft)
    listSources(draft)
    for (const st of draft.stages) {
      completionSources(draft, st.stageId)
      usesGoalCompletion(draft, st)
      for (const sc of st.scenes) for (const o of sc.objects) if (o.type === 'lock') validateLock(o)
    }
    const published = await protectMission(JSON.parse(JSON.stringify(draft)))
    await play(published, rng(seed + 1))
  })
}

console.log('fuzz: a student resumes saved progress after the teacher republished a different mission')
for (const seed of SEEDS.slice(0, 80)) {
  await trial('resume on a different version', seed, async () => {
    const v1 = normalizeDraft(build(seed))
    const v2 = normalizeDraft(build(seed + 5000))
    const saved = await play(v1, rng(seed + 2), null, 25)
    await play(v2, rng(seed + 3), saved, 25)
  })
}

console.log('fuzz: old and corrupt data shapes')
const OLD_SHAPES = [
  null,
  undefined,
  {},
  { stages: [] },
  { stages: [{}] },
  { stages: [{ scenes: [{}] }] },
  { stages: [{ scenes: [{ objects: [{}] }] }] },
  { stages: [{ title: 'x', scenes: [{ sceneId: 'a', name: 'a', objects: [{ id: 'o', type: 'lock' }] }] }] },
  { stages: [{ scenes: [{ exits: null, objects: null, groups: null }], objectives: null }], stageLinks: null, settings: null },
  { schemaVersion: 1, stages: [{ stageId: 's', scenes: [{ sceneId: 'a', objects: [{ id: 'o', type: 'hotspot', onClick: [null] }] }] }] },
  { stages: [{ stageId: 's', scenes: [{ sceneId: 'a', objects: [{ id: 'o', type: 'lock', answer: 'oops', answerType: 'unknown' }] }] }] },
  { stages: [null, 5, 'x'] },
  { stages: [{ scenes: [null, 7] }] },
  { stages: [{ scenes: [{ objects: [null, 'x', 3] }] }] },
  { stages: [{ objectives: [null, {}], scenes: [{ groups: [null], exits: 'bad', exitConditions: 'bad' }] }], stageLinks: [null, {}, 'x'] },
  { stages: [{ stageId: 's', scenes: [{ sceneId: 'a', objects: [{ id: 'o', type: 'lock', answerType: 'choice', answer: { options: null, correct: 5 } }] }] }] },
  { stages: [{ stageId: 's', scenes: [{ sceneId: 'a', objects: [{ id: 'o', type: 'lock', answerType: 'multiChoice', answer: { options: [null, {}], correct: null } }] }] }] },
  { stages: [{ stageId: 's', scenes: [{ sceneId: 'a', objects: [{ id: 'o', type: 'lock', answerType: 'text', answer: { accepted: 'str', options: null } }] }] }] },
  { stages: [{ stageId: 's', scenes: [{ sceneId: 'a', objects: [{ id: 'o', type: 'lock', answerType: 'match', answer: { pairs: null } }] }] }] },
  { stages: [{ stageId: 's', scenes: [{ sceneId: 'a', objects: [{ id: 'o', type: 'lock', answerType: 'categorize', answer: { categories: null, items: [{}] } }] }] }] },
  { stages: [{ stageId: 's', scenes: [{ sceneId: 'a', objects: [{ id: 'o', type: 'lock', answerType: 'hotspot', answer: { regions: 'x' } }] }] }] },
  { stages: [{ stageId: 's', scenes: [{ sceneId: 'a', objects: [{ id: 'o', type: 'lock', answerType: 'dial', answer: { cells: -3, value: null } }] }] }] },
  { stages: [{ stageId: 's', scenes: [{ sceneId: 'a', objects: [{ id: 'o', type: 'lock', answerType: 'number', answer: { value: 'abc', units: null, tolerance: null } }] }] }] },
  [],
  'a string',
  42,
]
for (const [i, shape] of OLD_SHAPES.entries()) {
  await trial(`shape ${i}`, i, async () => {
    const draft = normalizeDraft(shape)
    checkMission(draft, new Set())
    listSources(draft)
    const published = await protectMission(JSON.parse(JSON.stringify(draft)))
    await play(published, rng(i), null, 10)
  })
}

console.log('compatibility: a mission and progress saved by an older version still open and play')
await trial('phase-4 era mission (one stage, none of the newer fields)', 4, async () => {
  const old = {
    schemaVersion: 1,
    flags: {},
    items: [],
    stages: [{ stageId: 'st_old', title: '第一關', startSceneId: 'sc_old', completeWhen: null, scenes: [{ sceneId: 'sc_old', name: '實驗室', exits: { right: null }, objects: [{ id: 'ob_old', type: 'hotspot', name: '門', x: 0, y: 0, w: 100, h: 100, onClick: [{ action: 'complete_stage' }] }] }] }],
  }
  const draft = normalizeDraft(old)
  assert.equal(checkMission(draft, new Set()).errors.length, 0)
  const engine = new GameEngine({ mission: draft, ui: quietUi() })
  await engine.start()
  assert.equal(engine.state.stageId, 'st_old')
  await engine.clickObject(engine.objects.get('ob_old').object)
  assert.equal(engine.state.missionDone, true)
  // progress saved before stages existed ("stageDone": true) resumes as finished
  const resumed = new GameEngine({ mission: draft, ui: quietUi(), saved: { sceneId: 'sc_old', flags: {}, stageDone: true, missionDone: true } })
  await resumed.start()
  assert.equal(resumed.state.stagesDone.st_old, true)
})

console.log('fuzz: statistics on random logs')
for (const seed of SEEDS.slice(0, 40)) {
  await trial('stats', seed, async () => {
    const r = rng(seed)
    const pick = (list) => list[Math.floor(r() * list.length)]
    const names = buildNames(r() < 0.5 ? build(seed) : null)
    const events = ['mission_start', 'stage_start', 'stage_complete', 'scene_enter', 'object_click', 'item_collect', 'lock_attempt', 'lock_solved', 'hint_shown', 'give_up', 'objective_done', 'mission_complete', 'mission_quit', 'brand_new_event']
    const payloads = [null, {}, { correct: 'maybe' }, { attempts: 'x', seconds: null, answer: { deep: [1] } }, { objectiveId: 'zzz' }, 'string payload']
    const rows = Array.from({ length: 6 }, (_, k) => ({
      session: { session_uuid: `u${k}`, started_at: '2026-01-01T00:00:00Z', student_name: pick(NASTY), mission_id: pick(['m1', null]) },
      logs: Array.from({ length: Math.floor(r() * 12) }, (_, n) => ({ id: n, seq: pick([n, null, 0]), event_type: pick(events), stage_id: pick(['st0', null, 'x']), scene_id: pick([null, 'y']), block_id: pick([null, 'ghost_object']), payload: pick(payloads), created_at: '2026-01-01T00:00:00Z' })),
    }))
    for (const row of rows) {
      summarizeMissionSession(row)
      for (const l of row.logs) describeMissionEvent(l, names)
    }
    analyzeStuck(rows, names)
  })
}

console.log(`${passed} passed, ${failed} failed`)
