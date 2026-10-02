// Run with: npm test   (plain node, no browser or database needed)
import assert from 'node:assert/strict'
import GameEngine from '../src/player/GameEngine.js'

let passed = 0
const test = async (name, fn) => {
  try {
    await fn()
    passed++
    console.log('  ok  ', name)
  } catch (e) {
    console.log('  FAIL', name, '\n     ', e.message)
    process.exitCode = 1
  }
}

const exits = () => ({ up: null, down: null, left: null, right: null, forward: null, backward: null })
// a stage with one scene "<id>_s" holding a button object "<id>_b" that runs `onClick`
const stage = (id, extra = {}, onClick = [{ action: 'complete_stage' }]) => ({
  stageId: id,
  title: `關卡 ${id}`,
  intro: '',
  startSceneId: `${id}_s`,
  completeWhen: null,
  onComplete: [],
  objectives: [],
  resetOnRetry: false,
  scenes: [{ sceneId: `${id}_s`, name: `${id}_s`, exits: exits(), exitConditions: {}, onEnter: [], background: null, groups: [], objects: [{ id: `${id}_b`, type: 'hotspot', name: 'b', visible: true, x: 0, y: 0, w: 1, h: 1, onClick }] }],
  ...extra,
})
const link = (from, to, when) => ({ id: `${from}-${to}`, from, to, ...(when ? { when } : {}) })
const make = async (stages, links = [], settings = {}, extra = {}) => {
  const logs = []
  const messages = []
  const intros = []
  const engine = new GameEngine({ mission: { stages, stageLinks: links, settings }, onLog: (t, e) => logs.push([t, e.stageId, e.payload]), ...extra })
  engine.ui = { message: async (m) => void messages.push(m), intro: async (st) => void intros.push(st.stageId) }
  await engine.start()
  return { engine, logs, messages, intros }
}
const click = (engine, id) => engine.clickObject(engine.objects.get(id).object)
const status = (engine) => Object.fromEntries(engine.stageCards().map((c) => [c.stage.stageId, c.status]))

console.log('stage map')
await test('a single stage starts straight in, as before', async () => {
  const { engine } = await make([stage('a')])
  assert.equal(engine.state.stageId, 'a')
  assert.equal(engine.scene().sceneId, 'a_s')
  await click(engine, 'a_b')
  assert.equal(engine.state.missionDone, true)
})
await test('a chain: finishing a stage unlocks the next; the map shows locked / open / done', async () => {
  const { engine } = await make([stage('a'), stage('b'), stage('c')], [link('a', 'b'), link('b', 'c')])
  assert.deepEqual(status(engine), { a: 'open', b: 'locked', c: 'locked' })
  assert.equal(engine.state.stageId, 'a') // the only starting stage: walk straight in
  await click(engine, 'a_b')
  assert.equal(engine.state.stageId, null) // back at the map
  assert.deepEqual(status(engine), { a: 'done', b: 'open', c: 'locked' })
  await engine.enterStage('c') // locked: refused
  assert.equal(engine.state.stageId, null)
  await engine.enterStage('b')
  await click(engine, 'b_b')
  await engine.enterStage('c')
  assert.equal(engine.state.missionDone, false)
  await click(engine, 'c_b')
  assert.equal(engine.state.missionDone, true)
})
await test('several starting stages: the student begins at the map and may play them in any order (parallel)', async () => {
  const { engine } = await make([stage('a'), stage('b'), stage('z')], [link('a', 'z'), link('b', 'z')])
  assert.equal(engine.state.stageId, null)
  assert.deepEqual(status(engine), { a: 'open', b: 'open', z: 'locked' })
  await engine.enterStage('b')
  await click(engine, 'b_b')
  assert.equal(status(engine).z, 'locked') // merge "all": needs both
  await engine.enterStage('a')
  await click(engine, 'a_b')
  assert.equal(status(engine).z, 'open')
})
await test('merge with "any": one finished path is enough', async () => {
  const { engine } = await make([stage('a'), stage('b'), stage('z', { join: 'any' })], [link('a', 'z'), link('b', 'z')])
  await engine.enterStage('a')
  await click(engine, 'a_b')
  assert.equal(status(engine).z, 'open')
})
await test('branches: only the connection whose condition holds opens; the mission ends when the opened ones are done', async () => {
  const pick = (flag) => [{ action: 'set_flag', flag }, { action: 'complete_stage' }]
  const stages = [stage('s', {}, pick('choseAcid')), stage('acid'), stage('base')]
  const links = [link('s', 'acid', { allFlags: ['choseAcid'] }), link('s', 'base', { allFlags: ['choseBase'] })]
  const { engine } = await make(stages, links)
  await click(engine, 's_b')
  assert.deepEqual(status(engine), { s: 'done', acid: 'open', base: 'locked' })
  await engine.enterStage('acid')
  await click(engine, 'acid_b')
  assert.equal(engine.state.missionDone, true) // base never unlocked: nothing left to play
})
await test('autoNextStage walks into the single next stage; otherwise it returns to the map', async () => {
  const auto = await make([stage('a'), stage('b')], [link('a', 'b')], { autoNextStage: true })
  await click(auto.engine, 'a_b')
  assert.equal(auto.engine.state.stageId, 'b')
  const manual = await make([stage('a'), stage('b')], [link('a', 'b')], { autoNextStage: false })
  await click(manual.engine, 'a_b')
  assert.equal(manual.engine.state.stageId, null)
})
await test('flags are shared across stages; goto_scene cannot jump into another stage', async () => {
  const first = stage('a', {}, [{ action: 'set_flag', flag: '拿到鑰匙' }, { action: 'complete_stage' }])
  const second = stage('b', {}, [{ action: 'goto_scene', sceneId: 'a_s' }])
  second.scenes[0].objects.push({ id: 'door', type: 'hotspot', name: 'd', visible: true, showWhen: { allFlags: ['拿到鑰匙'] }, x: 0, y: 0, w: 1, h: 1 })
  const { engine } = await make([first, second], [link('a', 'b')])
  await click(engine, 'a_b')
  await engine.enterStage('b')
  assert.equal(engine.isVisible(engine.objects.get('door').object), true)
  const warn = console.warn
  console.warn = () => {}
  await click(engine, 'b_b')
  console.warn = warn
  assert.equal(engine.scene().sceneId, 'b_s')
})
await test('opening text shows once per stage; coming back to a stage resumes in the scene you left', async () => {
  const s2 = stage('b', { intro: '<p>歡迎來到第二關</p>' })
  s2.scenes.push({ sceneId: 'b_2', name: 'b_2', exits: exits(), exitConditions: {}, onEnter: [], background: null, groups: [], objects: [] })
  const { engine, intros } = await make([stage('a', { intro: '<p>第一關開場</p>' }), s2], [link('a', 'b')])
  assert.deepEqual(intros, ['a'])
  await click(engine, 'a_b')
  await engine.enterStage('b')
  assert.deepEqual(intros, ['a', 'b'])
  await engine.enterScene('b_2', null)
  engine.leaveStage()
  await engine.enterStage('b')
  assert.equal(engine.scene().sceneId, 'b_2')
  assert.deepEqual(intros, ['a', 'b']) // not shown again
})
await test('replaying a finished stage with 重置 puts its own state back; without it nothing is reset', async () => {
  const onClick = [{ action: 'set_flag', flag: '機關開了' }, { action: 'hide_object', target: 'a_b' }]
  const mk = (reset) => [stage('a', { resetOnRetry: reset, completeWhen: { allFlags: ['機關開了'] } }, onClick), stage('b')]
  const withReset = await make(mk(true), [link('a', 'b')])
  await click(withReset.engine, 'a_b')
  assert.equal(withReset.engine.state.stagesDone.a, true)
  await withReset.engine.enterStage('a')
  assert.equal(withReset.engine.state.flags['機關開了'], undefined)
  assert.equal(withReset.engine.isVisible(withReset.engine.objects.get('a_b').object), true)
  assert.equal(withReset.engine.state.stagesDone.a, true) // stays done, so stage b stays open
  const without = await make(mk(false), [link('a', 'b')])
  await click(without.engine, 'a_b')
  await without.engine.enterStage('a')
  assert.equal(without.engine.state.flags['機關開了'], true)
})

console.log('objectives')
const goals = [
  { objectiveId: 'o1', text: '找到鑰匙', visibleWhen: null, doneWhen: { allFlags: ['key'] }, hints: ['看看桌子', '', '在抽屜裡'], onDone: [{ action: 'show_message', message: '很好！' }], hidden: false },
  { objectiveId: 'o2', text: '打開門', visibleWhen: { objectivesDone: ['o1'] }, doneWhen: null, hints: [], onDone: [], hidden: false },
  { objectiveId: 'egg', text: '彩蛋', visibleWhen: null, doneWhen: { allFlags: ['egg'] }, hints: [], onDone: [], hidden: true },
]
await test('objectives complete by themselves when their condition holds, run their events, and appear in order', async () => {
  const { engine, messages, logs } = await make([stage('a', { objectives: goals }, [{ action: 'set_flag', flag: 'key' }])])
  assert.deepEqual(engine.currentObjectives().map((o) => [o.id, o.done]), [['o1', false]]) // o2 waits for o1, the egg stays hidden
  await click(engine, 'a_b')
  assert.deepEqual(engine.currentObjectives().map((o) => [o.id, o.done]), [['o1', true], ['o2', false]])
  assert.deepEqual(messages, ['很好！'])
  assert.ok(logs.some(([t, , p]) => t === 'objective_done' && p.objectiveId === 'o1'))
})
await test('the "complete objective" action finishes one by event; a hidden bonus shows only once done', async () => {
  const { engine } = await make([stage('a', { objectives: goals }, [{ action: 'complete_objective', objectiveId: 'o1' }, { action: 'set_flag', flag: 'egg' }])])
  await click(engine, 'a_b')
  assert.deepEqual(engine.currentObjectives().map((o) => o.id), ['o1', 'o2', 'egg'])
  assert.equal(engine.currentObjectives().find((o) => o.id === 'egg').done, true)
})
await test('objective hints come one at a time and skip empty ones', async () => {
  const { engine } = await make([stage('a', { objectives: goals })])
  const o = () => engine.currentObjectives()[0]
  assert.equal(o().hints.length, 2)
  engine.requestObjectiveHint('o1')
  assert.equal(o().hintsShown, 1)
  engine.requestObjectiveHint('o1')
  engine.requestObjectiveHint('o1') // nothing left
  assert.equal(o().hintsShown, 2)
})
await test('a stage can finish by its objectives (completeWhen: objectivesDone)', async () => {
  const st = stage('a', { objectives: goals.slice(0, 1), completeWhen: { objectivesDone: ['o1'] } }, [{ action: 'set_flag', flag: 'key' }])
  const { engine } = await make([st])
  await click(engine, 'a_b')
  assert.equal(engine.state.missionDone, true)
})

console.log('saved progress')
await test('progress survives a refresh, including the stage map and unlocks; old single-stage saves still load', async () => {
  const first = await make([stage('a'), stage('b')], [link('a', 'b')])
  await click(first.engine, 'a_b')
  const saved = first.engine.serialize()
  const second = new GameEngine({ mission: { stages: [stage('a'), stage('b')], stageLinks: [link('a', 'b')] }, saved })
  second.ui = {}
  await second.start()
  assert.deepEqual(status(second), { a: 'done', b: 'open' })
  assert.equal(second.state.stageId, null)
  const legacy = new GameEngine({ stage: stage('only'), saved: { sceneId: 'only_s', stageDone: true, flags: {}, missionDone: true } })
  assert.equal(legacy.state.stagesDone.only, true)
})
console.log('goals alone can finish a stage')
const goal = (id, extra = {}) => ({ objectiveId: id, text: id, visibleWhen: null, doneWhen: null, hints: [], onDone: [], hidden: false, ...extra })
await test('no way to finish set, but goals exist: finishing every non-secret goal ends the stage', async () => {
  const st = stage('a', { objectives: [goal('g1'), goal('g2'), goal('egg', { hidden: true })] }, [{ action: 'complete_objective', objectiveId: 'g1' }])
  const { engine } = await make([st])
  await click(engine, 'a_b')
  assert.equal(engine.state.stagesDone.a, undefined) // g2 still open (the secret one does not count)
  await engine.markObjectiveDone('g2')
  await engine.checkCompletion()
  assert.equal(engine.state.stagesDone.a, true)
  assert.equal(engine.state.missionDone, true)
})
await test('it does not apply when the teacher set their own way to finish', async () => {
  const st = stage('a', { objectives: [goal('g1')], completeWhen: { allFlags: ['never'] } }, [{ action: 'complete_objective', objectiveId: 'g1' }])
  const { engine } = await make([st])
  await click(engine, 'a_b')
  assert.equal(engine.state.stagesDone.a, undefined)
  const withStep = stage('b', { objectives: [goal('g1')] }, [{ action: 'complete_objective', objectiveId: 'g1' }])
  withStep.scenes[0].objects.push({ id: 'b_other', type: 'hotspot', name: 'o', visible: true, x: 0, y: 0, w: 1, h: 1, onClick: [{ action: 'complete_stage' }] })
  const second = await make([withStep])
  await click(second.engine, 'b_b')
  assert.equal(second.engine.state.stagesDone.b, undefined) // a "finish stage" step exists, so it decides
})
await test('the health check does not complain about a stage that finishes by its goals', async () => {
  const { checkMission } = await import('../src/lib/missionCheck.js')
  const st = stage('a', { objectives: [goal('g1', { doneWhen: { allFlags: ['f'] } })] }, [{ action: 'set_flag', flag: 'f' }])
  const r = checkMission({ settings: {}, stageLinks: [], stages: [st] }, new Set())
  assert.ok(!r.warnings.some((w) => w.includes('無法過關')))
  assert.equal(r.errorWhere.length, r.errors.length)
  assert.equal(r.warningWhere.length, r.warnings.length)
})
await test('every finding says where to jump to', async () => {
  const { checkMission } = await import('../src/lib/missionCheck.js')
  const st = stage('a', {}, [{ action: 'reveal_object', target: 'ghost' }, { action: 'complete_stage' }])
  const r = checkMission({ settings: {}, stageLinks: [], stages: [st] }, new Set())
  const i = r.errors.findIndex((e) => e.includes('不存在'))
  assert.deepEqual(r.errorWhere[i], { stageId: 'a', sceneId: 'a_s', objectId: 'a_b' })
})

console.log('health check for several stages')
const { checkMission } = await import('../src/lib/missionCheck.js')
const ok = (data) => checkMission({ settings: {}, stageLinks: [], ...data }, new Set())
await test('a clean two-stage mission passes; the report names the stage at fault', () => {
  const clean = ok({ stages: [stage('a'), stage('b')], stageLinks: [link('a', 'b')] })
  assert.deepEqual(clean.errors, [])
  const bad = stage('b')
  bad.scenes[0].objects[0].onClick = [{ action: 'reveal_object', target: 'ghost' }, { action: 'complete_stage' }]
  const r = ok({ stages: [stage('a'), bad], stageLinks: [link('a', 'b')] })
  assert.ok(r.errors.some((e) => e.includes('關卡 b') && e.includes('不存在')))
})
await test('catches a jump into another stage, an objective nobody can finish, and deleted objectives in conditions', () => {
  const a = stage('a', { objectives: [{ objectiveId: 'o1', text: '無法完成的目標', doneWhen: null, visibleWhen: { objectivesDone: ['gone'] }, hints: [], onDone: [], hidden: false }] })
  const b = stage('b', {}, [{ action: 'goto_scene', sceneId: 'a_s' }, { action: 'complete_stage' }])
  const r = ok({ stages: [a, b], stageLinks: [link('a', 'b')] })
  assert.ok(r.errors.some((e) => e.includes('另一關')))
  assert.ok(r.errors.some((e) => e.includes('已經刪除的任務目標')))
  assert.ok(r.warnings.some((w) => w.includes('無法完成的目標') && w.includes('沒有完成方式')))
})
await test('warns about a stage that can never open, and errors when no stage can start', () => {
  const never = ok({ stages: [stage('a'), stage('b'), stage('c', { join: 'all' })], stageLinks: [link('a', 'c'), link('b', 'c'), link('c', 'b')] })
  assert.ok(never.warnings.some((w) => w.includes('永遠不會開放')))
  const loop = ok({ stages: [stage('a'), stage('b')], stageLinks: [link('a', 'b'), link('b', 'a')] })
  assert.ok(loop.errors.some((e) => e.includes('沒有一關是一開始就能玩的')))
})
await test('an objective finished by an event is fine', () => {
  const a = stage('a', { objectives: [{ objectiveId: 'o1', text: '用事件完成', doneWhen: null, visibleWhen: null, hints: [], onDone: [], hidden: false }] }, [{ action: 'complete_objective', objectiveId: 'o1' }, { action: 'complete_stage' }])
  const r = ok({ stages: [a] })
  assert.deepEqual(r.errors, [])
  assert.ok(!r.warnings.some((w) => w.includes('沒有完成方式')))
})
console.log(`\n${passed} passed`)
