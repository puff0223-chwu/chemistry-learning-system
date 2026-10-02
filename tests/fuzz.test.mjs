// 崩潰測試（亂數）：隨機產生各種「歪七扭八」的任務資料，丟進整條流程，要求任何情況都不當機。
// 同樣的種子（seed）結果一定相同，失敗時會印出種子，方便重現。  Run with: npm test
import assert from 'node:assert/strict'
import GameEngine from '../src/player/GameEngine.js'
import { checkMission } from '../src/lib/missionCheck.js'
import { collectFlags, completionSources, flagUsage, listSources, usesGoalCompletion } from '../src/lib/missionEvents.js'
import { newAnswer, protectMission, validateLock, ANSWER_TYPES } from '../src/lib/lockLogic.js'
import { createObject, createScene, createStage, normalizeDraft } from '../src/lib/missionSchema.js'
// (missions.js talks to Supabase, so a plain copy of the empty shape lives here)
const emptyMissionData = () => ({ schemaVersion: 1, settings: { timeLimitSeconds: null, hideLockedStages: false, autoNextStage: false, giveUpDefault: { enabled: true, afterAttempts: 3 } }, flags: {}, items: [], stages: [], stageLinks: [], finalChallenge: null })
import { analyzeStuck, buildNames, describeMissionEvent, summarizeMissionSession } from '../src/lib/missionStats.js'

// small seeded random generator (mulberry32)
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const NASTY = ['', ' ', '   ', '"引號"', "it's", '<script>alert(1)</script>', '<b>粗體</b>', 'emoji 😀🧪', '很長'.repeat(300), '\n換行\n', '\\ % _', '0', 'null', 'undefined', '𠮷', 'A'.repeat(2000)]
const DIRS = ['up', 'down', 'left', 'right', 'forward', 'backward', 'sideways']

function build(seed) {
  const r = rng(seed)
  const pick = (list) => list[Math.floor(r() * list.length)]
  const chance = (p) => r() < p
  const between = (a, b) => a + Math.floor(r() * (b - a + 1))
  const text = () => (chance(0.3) ? pick(NASTY) : `文字${between(1, 99)}`)

  const stageCount = between(0, 5)
  const stages = []
  const sceneIds = ['ghost_scene']
  const objectIds = ['ghost_object']
  const objectiveIds = ['ghost_goal']
  const flags = ['記號A', '記號B', '', '  ', '記號 with space']
  const lockIds = []

  for (let i = 0; i < stageCount; i++) {
    const stage = createStage(text())
    stage.stageId = chance(0.05) ? 'dup_stage' : `st${i}`
    const sceneCount = between(0, 4)
    stage.scenes = []
    for (let s = 0; s < sceneCount; s++) {
      const sc = createScene(text())
      sc.sceneId = `${stage.stageId}_sc${s}`
      sceneIds.push(sc.sceneId)
      const objCount = between(0, 6)
      for (let o = 0; o < objCount; o++) {
        const type = pick(['image', 'video', 'icon', 'text', 'hotspot', 'lock', 'lock'])
        const obj = createObject(type)
        obj.id = `${sc.sceneId}_o${o}`
        obj.name = text()
        obj.x = chance(0.1) ? -500 : between(0, 1600)
        obj.y = chance(0.1) ? 99999 : between(0, 900)
        obj.w = chance(0.1) ? 0 : between(1, 1800)
        obj.h = chance(0.1) ? 0 : between(1, 1000)
        if (chance(0.2)) obj.groupId = pick(['g1', 'g2', 'ghost_group'])
        if (chance(0.1)) obj.visible = false
        objectIds.push(obj.id)
        if (type === 'lock') {
          lockIds.push(obj.id)
          obj.answerType = pick(ANSWER_TYPES).type
          obj.answer = newAnswer(obj.answerType)
          if (chance(0.5)) obj.prompt = chance(0.5) ? text() : `<p>${text()}</p>`
          if (chance(0.3)) obj.hints = [text(), '', text()]
          if (chance(0.2)) obj.answer = chance(0.5) ? {} : null // corrupt answer
        }
        sc.objects.push(obj)
      }
      sc.groups = [{ id: 'g1', name: text() }]
      stage.scenes.push(sc)
    }
    const objectives = []
    for (let g = 0; g < between(0, 3); g++) {
      const id = `${stage.stageId}_g${g}`
      objectiveIds.push(id)
      objectives.push({ objectiveId: id, text: text(), visibleWhen: null, doneWhen: null, hints: [text(), ''], onDone: [], hidden: chance(0.2) })
    }
    stage.objectives = objectives
    stage.startSceneId = chance(0.15) ? 'ghost_scene' : (stage.scenes[0]?.sceneId ?? null)
    stage.join = pick(['all', 'any', 'weird'])
    stage.resetOnRetry = chance(0.4)
    stages.push(stage)
  }

  const cond = () => {
    if (chance(0.3)) return null
    const c = {}
    if (chance(0.5)) c.allFlags = [pick(flags), pick(flags)]
    if (chance(0.3)) c.anyFlags = [pick(flags)]
    if (chance(0.3)) c.notFlags = [pick(flags)]
    if (chance(0.3)) c.objectivesDone = [pick(objectiveIds), '']
    if (chance(0.2)) c.elapsedSecondsAtLeast = pick([0, 1, 999999, -5, 'x'])
    if (chance(0.1)) c.hasItems = ['item1']
    return c
  }
  const actionTypes = ['show_message', 'goto_scene', 'reveal_object', 'hide_object', 'swap_background', 'set_flag', 'clear_flag', 'play_sound', 'open_lock', 'delay', 'complete_objective', 'complete_stage', 'add_item', 'remove_item', 'add_notebook', 'set_state', 'not_a_real_action']
  const action = (depth = 0) => {
    if (depth < 2 && chance(0.15)) return { if: cond() ?? {}, then: actions(depth + 1), else: actions(depth + 1) }
    const type = pick(actionTypes)
    return {
      action: type,
      message: text(),
      sceneId: pick(sceneIds),
      target: pick([...objectIds, ...lockIds, null]),
      flag: pick(flags),
      assetId: pick([null, 'ghost_asset']),
      objectiveId: pick(objectiveIds),
      itemId: 'item1',
      entryText: text(),
      ms: pick([0, 1, 3, -1, "x"]),
      transition: pick(['', 'left', 'forward', 'nonsense']),
    }
  }
  const actions = (depth = 0) => Array.from({ length: between(0, 3) }, () => action(depth))

  for (const st of stages) {
    if (chance(0.3)) st.completeWhen = cond() ?? {}
    st.onComplete = actions()
    for (const o of st.objectives) {
      o.visibleWhen = cond()
      o.doneWhen = cond()
      o.onDone = actions()
    }
    for (const sc of st.scenes) {
      sc.onEnter = actions()
      for (const dir of DIRS) if (chance(0.25)) sc.exits[dir] = pick(sceneIds)
      for (const dir of DIRS) if (chance(0.15)) sc.exitConditions[dir] = { when: cond(), message: text() }
      for (const o of sc.objects) {
        o.onClick = actions()
        if (chance(0.3)) o.showWhen = cond()
        if (o.type === 'lock') {
          o.onSuccess = actions()
          o.onGiveUp = actions()
        }
      }
    }
  }
  const stageLinks = Array.from({ length: between(0, 6) }, (_, i) => ({
    id: `l${i}`,
    from: pick(stages.map((s) => s.stageId).concat('ghost_stage')),
    to: pick(stages.map((s) => s.stageId).concat('ghost_stage')),
    ...(chance(0.4) ? { when: cond() } : {}),
  }))
  return { ...emptyMissionData(), stages, stageLinks, settings: { ...emptyMissionData().settings, hideLockedStages: chance(0.5), autoNextStage: chance(0.5) } }
}

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
