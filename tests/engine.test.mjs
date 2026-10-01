// Run with: npm test   (plain node, no browser or database needed)
import assert from 'node:assert/strict'
import GameEngine from '../src/player/GameEngine.js'
import { collectFlags, evalCondition } from '../src/lib/missionEvents.js'
import { checkMission } from '../src/lib/missionCheck.js'

let passed = 0
const test = async (name, fn) => {
  try {
    await fn()
    passed++
    console.log('  ok  ', name)
  } catch (e) {
    console.log('  FAIL', name, '\n      ', e.message)
    process.exitCode = 1
  }
}

const obj = (id, extra = {}) => ({ id, type: 'hotspot', name: id, x: 0, y: 0, w: 10, h: 10, visible: true, ...extra })
const mkStage = () => ({
  stageId: 'st1',
  title: 'T',
  startSceneId: 'A',
  completeWhen: null,
  onComplete: [{ action: 'show_message', message: 'done!' }],
  scenes: [
    {
      sceneId: 'A',
      name: 'A',
      exits: { right: 'B', forward: 'C' },
      exitConditions: { forward: { when: { allFlags: ['goggles'] }, message: '先戴護目鏡' } },
      onEnter: [{ if: { notFlags: ['seenA'] }, then: [{ action: 'show_message', message: 'welcome' }, { action: 'set_flag', flag: 'seenA' }], else: [] }],
      background: { type: 'color', color: '#000' },
      objects: [
        obj('key', { onClick: [{ action: 'set_flag', flag: 'hasKey' }, { action: 'hide_object', target: 'key' }, { action: 'reveal_object', target: 'door' }], logClick: true }),
        obj('door', { visible: false, showWhen: { allFlags: ['hasKey'] }, onClick: [{ action: 'complete_stage' }] }),
        obj('goggles', { onClick: [{ action: 'set_flag', flag: 'goggles' }] }),
      ],
    },
    { sceneId: 'B', name: 'B', exits: { left: 'A' }, exitConditions: {}, onEnter: [], objects: [], background: null },
    { sceneId: 'C', name: 'C', exits: {}, exitConditions: {}, onEnter: [{ action: 'goto_scene', sceneId: 'B' }], objects: [], background: null },
  ],
})

const make = (stageOverride = {}, extra = {}) => {
  const messages = []
  const logs = []
  const engine = new GameEngine({
    stage: { ...mkStage(), ...stageOverride },
    onLog: (t, e) => logs.push([t, e]),
    ...extra,
  })
  engine.ui = { message: async (m) => void messages.push(m) }
  return { engine, messages, logs }
}

console.log('conditions')
await test('empty condition always true', () => assert.equal(evalCondition(null, { flags: {} }), true))
await test('allFlags / anyFlags / notFlags', () => {
  const v = { flags: { a: true }, items: [], objectivesDone: [], notebookCount: 0, elapsedSeconds: 10 }
  assert.equal(evalCondition({ allFlags: ['a'] }, v), true)
  assert.equal(evalCondition({ allFlags: ['a', 'b'] }, v), false)
  assert.equal(evalCondition({ anyFlags: ['b', 'a'] }, v), true)
  assert.equal(evalCondition({ notFlags: ['a'] }, v), false)
  assert.equal(evalCondition({ elapsedSecondsAtLeast: 5 }, v), true)
  assert.equal(evalCondition({ elapsedSecondsAtLeast: 11 }, v), false)
  assert.equal(evalCondition({ allFlags: ['a'], notFlags: ['z'], elapsedSecondsAtLeast: 5 }, v), true)
})

console.log('engine')
await test('start: first scene, enter event with if/else runs once', async () => {
  const { engine, messages, logs } = make()
  await engine.start()
  assert.equal(engine.state.sceneId, 'A')
  assert.deepEqual(messages, ['welcome'])
  assert.equal(engine.state.flags.seenA, true)
  assert.ok(logs.some(([t]) => t === 'mission_start'))
  await engine.tryExit('right')
  await engine.tryExit('left')
  assert.deepEqual(messages, ['welcome']) // not repeated: guarded by the flag
})
await test('hidden object with showWhen stays hidden until condition + reveal', async () => {
  const { engine } = make()
  await engine.start()
  const door = engine.objects.get('door').object
  assert.equal(engine.isVisible(door), false)
  await engine.clickObject(engine.objects.get('key').object)
  assert.equal(engine.state.flags.hasKey, true)
  assert.equal(engine.isVisible(engine.objects.get('key').object), false)
  assert.equal(engine.isVisible(door), true)
})
await test('exit condition blocks and shows message, then allows', async () => {
  const { engine, messages } = make()
  await engine.start()
  await engine.tryExit('forward')
  assert.equal(engine.state.sceneId, 'A')
  assert.ok(messages.includes('先戴護目鏡'))
  await engine.clickObject(engine.objects.get('goggles').object)
  await engine.tryExit('forward')
  // C's on-enter sends the student on to B
  assert.equal(engine.state.sceneId, 'B')
})
await test('transition info is set for animated scene changes', async () => {
  const { engine } = make()
  await engine.start()
  await engine.tryExit('right')
  assert.equal(engine.state.transition.kind, 'right')
  assert.equal(engine.state.transition.from, 'A')
})
await test('complete_stage runs onComplete then mission done, once', async () => {
  const { engine, messages, logs } = make()
  await engine.start()
  await engine.clickObject(engine.objects.get('key').object)
  await engine.clickObject(engine.objects.get('door').object)
  assert.equal(engine.state.missionDone, true)
  assert.ok(messages.includes('done!'))
  await engine.completeStage()
  assert.equal(logs.filter(([t]) => t === 'stage_complete').length, 1)
  assert.equal(logs.filter(([t]) => t === 'object_click').length, 1) // only the object with logClick
})
await test('completeWhen finishes the stage automatically', async () => {
  const { engine } = make({ completeWhen: { allFlags: ['hasKey'] } })
  await engine.start()
  assert.equal(engine.state.stageDone, false)
  await engine.clickObject(engine.objects.get('key').object)
  assert.equal(engine.state.missionDone, true)
})
await test('endless on-enter loop is stopped', async () => {
  const loopStage = {
    startSceneId: 'X',
    scenes: [
      { sceneId: 'X', name: 'X', exits: {}, exitConditions: {}, onEnter: [{ action: 'goto_scene', sceneId: 'Y' }], objects: [], background: null },
      { sceneId: 'Y', name: 'Y', exits: {}, exitConditions: {}, onEnter: [{ action: 'goto_scene', sceneId: 'X' }], objects: [], background: null },
    ],
  }
  const { engine } = make(loopStage)
  const origError = console.error
  console.error = () => {}
  await engine.start() // must terminate
  console.error = origError
  assert.ok(['X', 'Y'].includes(engine.state.sceneId))
})
await test('resume restores state without repeating the enter event', async () => {
  const first = make()
  await first.engine.start()
  await first.engine.clickObject(first.engine.objects.get('key').object)
  const saved = first.engine.serialize()
  const second = make({}, { saved })
  await second.engine.start()
  assert.equal(second.engine.state.flags.hasKey, true)
  assert.deepEqual(second.messages, []) // no second "welcome"
  assert.ok(!second.logs.some(([t]) => t === 'mission_start'))
})
await test('swap_background and add_item / hasItems', async () => {
  const { engine } = make({
    scenes: [{ sceneId: 'A', name: 'A', exits: {}, exitConditions: {}, onEnter: [], background: { type: 'color', color: '#000' }, objects: [obj('o', { onClick: [{ action: 'swap_background', sceneId: 'A', assetId: 'x1' }, { action: 'add_item', itemId: 'key1' }] }), obj('p', { showWhen: { hasItems: ['key1'] } })] }],
  })
  await engine.start()
  assert.equal(engine.isVisible(engine.objects.get('p').object), false)
  await engine.clickObject(engine.objects.get('o').object)
  assert.equal(engine.background(engine.scene()).assetId, 'x1')
  assert.equal(engine.isVisible(engine.objects.get('p').object), true)
})
await test('collectFlags finds flags in events, branches and conditions', () => {
  const flags = collectFlags({ stages: [mkStage()] })
  assert.deepEqual(flags, ['goggles', 'hasKey', 'seenA'])
})

console.log('health check')
await test('a clean mission has no errors', () => {
  const data = { stages: [{ ...mkStage(), completeWhen: { allFlags: ['hasKey'] } }] }
  const r = checkMission(data, new Set())
  assert.deepEqual(r.errors, [])
})
await test('catches bad targets, missing assets and unreachable scenes', () => {
  const stage = mkStage()
  stage.scenes[0].exits.up = 'nope'
  stage.scenes[0].objects[2].onClick = [{ action: 'goto_scene', sceneId: 'ghost' }, { action: 'reveal_object', target: 'ghost' }, { action: 'set_flag', flag: '' }]
  stage.scenes[0].objects[1].onClick = []
  stage.scenes[1].objects.push({ id: 'img', type: 'image', name: 'img', assetId: 'gone', x: 0, y: 0, w: 1, h: 1, visible: true })
  stage.scenes.push({ sceneId: 'Z', name: 'Z', exits: {}, exitConditions: {}, objects: [], background: null })
  const r = checkMission({ stages: [stage] }, new Set())
  const text = r.errors.join('|')
  for (const part of ['「up」出口指向不存在', '前往場景', '顯示物件', '旗標名稱', '已經從素材庫刪除']) assert.ok(text.includes(part), `missing error about ${part}`)
  assert.ok(r.warnings.some((w) => w.includes('場景「Z」沒有任何路')))
  assert.ok(r.warnings.some((w) => w.includes('無法過關')))
})

console.log(`\n${passed} passed`)
