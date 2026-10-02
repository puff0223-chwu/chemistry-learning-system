// 亂數產生「歪七扭八」的任務資料（給 fuzz.test.mjs 與畫面崩潰掃描共用；同一個種子結果一定相同）
import { createObject, createScene, createStage } from '../src/lib/missionSchema.js'
import { newAnswer, ANSWER_TYPES } from '../src/lib/lockLogic.js'
// (missions.js talks to Supabase, so a plain copy of the empty shape lives here)
const emptyMissionData = () => ({ schemaVersion: 1, settings: { timeLimitSeconds: null, hideLockedStages: false, autoNextStage: false, giveUpDefault: { enabled: true, afterAttempts: 3 } }, flags: {}, items: [], stages: [], stageLinks: [], finalChallenge: null })

// small seeded random generator (mulberry32)
export function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const NASTY = ['', ' ', '   ', '"引號"', "it's", '<script>alert(1)</script>', '<b>粗體</b>', 'emoji 😀🧪', '很長'.repeat(300), '\n換行\n', '\\ % _', '0', 'null', 'undefined', '𠮷', 'A'.repeat(2000)]
export const DIRS = ['up', 'down', 'left', 'right', 'forward', 'backward', 'sideways']

export function build(seed) {
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

