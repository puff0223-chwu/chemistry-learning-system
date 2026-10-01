// Run with: npm test   (plain node, no browser or database needed)
import assert from 'node:assert/strict'
const base = '../src/'
const { default: GameEngine } = await import(base + 'player/GameEngine.js')
const L = await import(base + 'lib/lockLogic.js')
let passed = 0
const test = async (n, f) => {
  try {
    await f()
    passed++
    console.log('  ok  ', n)
  } catch (e) {
    console.log('  FAIL', n, '\n     ', e.message)
    process.exitCode = 1
  }
}

const lockObj = (extra = {}) => ({
  id: 'LK',
  type: 'lock',
  name: '保險箱',
  x: 0, y: 0, w: 10, h: 10,
  visible: true,
  ...L.lockDefaults(),
  prompt: '<p>水的化學式？</p>',
  answerType: 'text',
  answer: { accepted: ['H2O'], options: { ...L.TEXT_OPTIONS_DEFAULT } },
  hints: ['想想氫和氧', '兩個氫', '一個氧'],
  explanation: '<p>水是 H₂O</p>',
  onSuccess: [{ action: 'set_flag', flag: '解開保險箱' }, { action: 'reveal_object', target: 'GROUP1' }],
  onGiveUp: [{ action: 'set_flag', flag: '看過解析' }],
  ...extra,
})
const stage = (lock) => ({
  stageId: 's', title: 't', startSceneId: 'A', completeWhen: null, onComplete: [],
  scenes: [{
    sceneId: 'A', name: 'A', exits: {}, exitConditions: {}, onEnter: [], background: null,
    groups: [{ id: 'GROUP1', name: '寶物' }],
    objects: [
      lock,
      { id: 'g1', type: 'icon', name: '金幣', visible: false, groupId: 'GROUP1', x: 0, y: 0, w: 1, h: 1 },
      { id: 'g2', type: 'icon', name: '鑽石', visible: false, groupId: 'GROUP1', x: 0, y: 0, w: 1, h: 1 },
      { id: 'door', type: 'hotspot', name: '機關', visible: true, x: 0, y: 0, w: 1, h: 1, onClick: [{ action: 'open_lock', target: 'LK' }] },
    ],
  }],
})
const make = async (lock = lockObj(), protect = false) => {
  const finalLock = protect ? await L.protectLock(lock) : lock
  const events = { opened: [], closed: [], messages: [] }
  const logs = []
  const engine = new GameEngine({ stage: stage(finalLock), onLog: (t, e) => logs.push([t, e.blockId, e.payload]) })
  engine.ui = { lock: async (id) => void events.opened.push(id), closeLock: (id) => void events.closed.push(id), message: async (m) => void events.messages.push(m) }
  await engine.start()
  return { engine, events, logs }
}

for (const protect of [false, true]) {
  const tag = protect ? '(protected)' : '(clear)'
  console.log(`locks ${tag}`)
  await test(`${tag} clicking a lock, or an open_lock action, opens its dialog`, async () => {
    const { engine, events } = await make(lockObj(), protect)
    await engine.clickObject(engine.objects.get('LK').object)
    await engine.clickObject(engine.objects.get('door').object)
    assert.deepEqual(events.opened, ['LK', 'LK'])
  })
  await test(`${tag} wrong answers reveal hints one layer at a time, then offer give-up after 3 tries`, async () => {
    const { engine } = await make(lockObj(), protect)
    assert.deepEqual(engine.lockOptions('LK'), { canHint: false, canGiveUp: false, hintsTotal: 3 })
    let r = await engine.submitLock('LK', 'x')
    assert.equal(r.correct, false)
    assert.equal(engine.lockState('LK').hints, 1)
    assert.equal(engine.lockOptions('LK').canHint, true) // may ask for the next one
    await engine.submitLock('LK', 'y')
    assert.equal(engine.lockState('LK').hints, 2)
    assert.equal(engine.lockOptions('LK').canGiveUp, false)
    await engine.submitLock('LK', 'z')
    assert.equal(engine.lockState('LK').hints, 3)
    assert.equal(engine.lockOptions('LK').canGiveUp, true)
    assert.equal(engine.lockOptions('LK').canHint, false) // none left
  })
  await test(`${tag} give up shows the explanation, runs onGiveUp, does NOT pass; solving afterwards is marked`, async () => {
    const { engine, events, logs } = await make(lockObj(), protect)
    for (const x of ['a', 'b', 'c']) await engine.submitLock('LK', x)
    const explanation = await engine.giveUp('LK')
    assert.equal(explanation, '<p>水是 H₂O</p>')
    assert.equal(engine.state.flags['看過解析'], true)
    assert.equal(engine.lockState('LK').solved, false)
    assert.equal(engine.state.flags['解開保險箱'], undefined)
    assert.equal(engine.lockOptions('LK').canHint, false) // no new hints after giving up
    const wrongAgain = await engine.submitLock('LK', 'nope')
    assert.equal(wrongAgain.correct, false)
    assert.equal(engine.lockState('LK').hints, 3) // unchanged
    const ok = await engine.submitLock('LK', 'h₂o')
    assert.equal(ok.correct, true)
    assert.equal(engine.lockState('LK').afterGiveUp, true)
    assert.deepEqual(events.closed, ['LK'])
    assert.equal(engine.state.flags['解開保險箱'], true)
    const solved = logs.find(([t]) => t === 'lock_solved')
    assert.equal(solved[2].afterGiveUp, true)
    assert.ok(logs.some(([t]) => t === 'give_up'))
    assert.equal(logs.filter(([t]) => t === 'lock_attempt').length, 5)
  })
  await test(`${tag} give-up is refused too early or when switched off`, async () => {
    const { engine } = await make(lockObj(), protect)
    await engine.submitLock('LK', 'x')
    assert.equal(await engine.giveUp('LK'), null)
    const off = await make(lockObj({ giveUp: { enabled: false, afterAttempts: 1 } }), protect)
    await off.engine.submitLock('LK', 'x')
    assert.equal(off.engine.lockOptions('LK').canGiveUp, false)
  })
  await test(`${tag} onRequest mode: hints only when asked`, async () => {
    const { engine } = await make(lockObj({ hintMode: 'onRequest' }), protect)
    assert.equal(engine.lockOptions('LK').canHint, true)
    await engine.submitLock('LK', 'x')
    assert.equal(engine.lockState('LK').hints, 0)
    engine.requestHint('LK')
    engine.requestHint('LK')
    assert.equal(engine.lockState('LK').hints, 2)
  })
  await test(`${tag} solving reveals a whole group at once; a solved lock stays solved`, async () => {
    const { engine } = await make(lockObj(), protect)
    assert.equal(engine.isVisible(engine.objects.get('g1').object), false)
    await engine.submitLock('LK', 'H2O')
    assert.equal(engine.isVisible(engine.objects.get('g1').object), true)
    assert.equal(engine.isVisible(engine.objects.get('g2').object), true)
    const again = await engine.submitLock('LK', 'whatever')
    assert.equal(again.already, true)
    assert.equal(engine.lockState('LK').wrong, 0)
  })
  await test(`${tag} wrong-answer feedback comes back with the result`, async () => {
    const { engine } = await make(lockObj({ wrongFeedback: [{ match: 'H2', message: '那是氫氣喔' }] }), protect)
    const r = await engine.submitLock('LK', 'H₂')
    assert.equal(r.feedback, '那是氫氣喔')
  })
}

await test('lock progress survives a refresh (saved state)', async () => {
  const first = await make()
  await first.engine.submitLock('LK', 'x')
  const saved = first.engine.serialize()
  const events = { opened: [] }
  const second = new GameEngine({ stage: stage(lockObj()), saved })
  second.ui = { lock: async (id) => events.opened.push(id), message: async () => {} }
  await second.start()
  assert.equal(second.lockState('LK').wrong, 1)
  assert.equal(second.lockState('LK').hints, 1)
})
console.log(`\n${passed} passed`)
