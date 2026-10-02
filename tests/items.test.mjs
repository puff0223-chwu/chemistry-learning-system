// Phase 7: items, the evidence bag, collectible objects, sockets, devices, combinations.  Run with: npm test
import assert from 'node:assert/strict'
import GameEngine from '../src/player/GameEngine.js'
import { checkMission } from '../src/lib/missionCheck.js'
import { describeCondition, evalCondition, isEmptyCondition } from '../src/lib/missionEvents.js'
import { createObject, normalizeDraft } from '../src/lib/missionSchema.js'

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
const obj = (type, id, extra = {}) => ({ ...createObject(type), id, name: id, ...extra })
// a one-stage mission with the given objects in its only scene
const mission = (objects, extra = {}) =>
  normalizeDraft({
    items: [
      { itemId: 'key', name: '鑰匙', icon: '🔑' },
      { itemId: 'tube', name: '試管', icon: '🧪' },
      { itemId: 'liquid', name: '試劑', icon: '💧' },
      { itemId: 'full', name: '裝好試劑的試管', icon: '⚗️' },
    ],
    combinations: [{ id: 'c1', a: 'tube', b: 'liquid', result: 'full', message: '把試劑倒進試管' }],
    ...extra,
    stages: [{ stageId: 's', title: '一', startSceneId: 'sc', scenes: [{ sceneId: 'sc', name: '場景', exits: exits(), objects }] }],
  })
const play = async (m, saved = null) => {
  const logs = []
  const toasts = []
  const messages = []
  const engine = new GameEngine({ mission: m, saved, onLog: (t, e) => logs.push([t, e.blockId, e.payload]) })
  engine.ui = { message: async (t) => void messages.push(t), toast: (t) => toasts.push(t), intro: async () => {}, lock: async () => {}, closeLock: () => {} }
  await engine.start()
  return { engine, logs, toasts, messages }
}
const click = (e, id) => e.clickObject(e.objects.get(id).object)

console.log('data: damaged sockets and devices are repaired on load')
await test('a socket or device with missing / wrong fields still gets a complete shape', () => {
  const m = normalizeDraft({ stages: [{ scenes: [{ objects: [{ id: 'a', type: 'socket', accepts: 'x', onMatch: null }, { id: 'b', type: 'device', states: [null, {}, { id: 'x' }, { id: 'x' }], initialState: 'nope', onState: [] }] }] }] })
  const [sock, dev] = m.stages[0].scenes[0].objects
  assert.deepEqual([sock.accepts, sock.onMatch, sock.onWrongItem], [[], [], []])
  assert.equal(dev.states.length, 3 + 1 - 1) // the empty / null ones are dropped or defaulted; duplicates get new ids
  assert.equal(new Set(dev.states.map((s) => s.id)).size, dev.states.length)
  assert.ok(dev.states.some((s) => s.id === dev.initialState))
  assert.deepEqual(dev.onState, {})
})

console.log('collecting and the bag')
await test('a collectible object goes into the bag and leaves the scene; the bag lists the item', async () => {
  const m = mission([obj('icon', 'o_key', { collectible: true, itemId: 'key' })])
  const { engine, logs, toasts } = await play(m)
  assert.equal(engine.isVisible(engine.objects.get('o_key').object), true)
  await click(engine, 'o_key')
  assert.deepEqual(engine.bag().map((i) => i.name), ['鑰匙'])
  assert.equal(engine.isVisible(engine.objects.get('o_key').object), false)
  assert.ok(logs.some(([t, , p]) => t === 'item_collect' && p.itemId === 'key'))
  assert.match(toasts[0], /鑰匙/)
  assert.equal(engine.check({ hasItems: ['key'] }), true)
  assert.equal(engine.check({ notHasItems: ['key'] }), false)
})
await test('add_item / remove_item events, and an item that was deleted from the mission is not shown', async () => {
  const m = mission([obj('hotspot', 'h', { onClick: [{ action: 'add_item', itemId: 'key' }, { action: 'add_item', itemId: 'ghost' }] }), obj('hotspot', 'r', { onClick: [{ action: 'remove_item', itemId: 'key' }] })])
  const { engine } = await play(m)
  await click(engine, 'h')
  assert.deepEqual(engine.state.items, ['key', 'ghost'])
  assert.deepEqual(engine.bag().map((i) => i.itemId), ['key']) // "ghost" has no definition
  await click(engine, 'r')
  assert.deepEqual(engine.state.items, ['ghost'])
})

console.log('sockets')
await test('a socket takes the right item (consumed, events run, logged) and refuses a wrong one', async () => {
  const m = mission([
    obj('socket', 'lock1', { accepts: ['key'], onMatch: [{ action: 'set_flag', flag: '開了' }], onWrongItem: [{ action: 'show_message', message: '插不進去' }] }),
    obj('hotspot', 'giveKey', { onClick: [{ action: 'add_item', itemId: 'key' }, { action: 'add_item', itemId: 'tube' }] }),
  ])
  const { engine, logs, messages } = await play(m)
  await click(engine, 'giveKey')
  assert.deepEqual(await engine.useItemOnSocket('lock1', 'tube'), { matched: false })
  assert.deepEqual(messages, ['插不進去'])
  assert.ok(logs.some(([t, id, p]) => t === 'socket_wrong' && id === 'lock1' && p.itemId === 'tube'))
  assert.equal(engine.state.flags['開了'], undefined)
  assert.deepEqual(await engine.useItemOnSocket('lock1', 'key'), { matched: true })
  assert.equal(engine.state.flags['開了'], true)
  assert.deepEqual(engine.state.items, ['tube']) // the key was consumed, the tube stays
  assert.equal(engine.state.socketsDone.lock1, true)
  assert.ok(logs.some(([t, id]) => t === 'socket_match' && id === 'lock1'))
  assert.deepEqual(await engine.useItemOnSocket('lock1', 'key'), { matched: false }) // no longer in the bag
})
await test('a socket that does not consume keeps the item; an item you do not hold cannot be used; hints come one by one', async () => {
  const m = mission([obj('socket', 'sk', { accepts: ['key'], consumeItem: false, hints: ['找找鑰匙', '', '鑰匙在抽屜'] }), obj('hotspot', 'g', { onClick: [{ action: 'add_item', itemId: 'key' }] })])
  const { engine, toasts } = await play(m)
  assert.deepEqual(await engine.useItemOnSocket('sk', 'key'), { matched: false })
  await click(engine, 'sk')
  await click(engine, 'sk')
  await click(engine, 'sk')
  assert.deepEqual(toasts, ['找找鑰匙', '鑰匙在抽屜', '鑰匙在抽屜'])
  await click(engine, 'g')
  assert.deepEqual(await engine.useItemOnSocket('sk', 'key'), { matched: true })
  assert.deepEqual(engine.state.items, ['key'])
})

console.log('combining items')
await test('two items in the bag become the result item; unknown pairs are refused', async () => {
  const m = mission([obj('hotspot', 'g', { onClick: [{ action: 'add_item', itemId: 'tube' }, { action: 'add_item', itemId: 'liquid' }, { action: 'add_item', itemId: 'key' }] })])
  const { engine, logs, toasts } = await play(m)
  await click(engine, 'g')
  assert.deepEqual(await engine.combineItems('tube', 'key'), { ok: false })
  assert.match(toasts.at(-1), /湊不在一起/)
  assert.deepEqual(await engine.combineItems('liquid', 'tube'), { ok: true, result: 'full' }) // either order
  assert.deepEqual(engine.state.items.sort(), ['full', 'key'])
  assert.equal(toasts.at(-1), '把試劑倒進試管')
  assert.ok(logs.some(([t, , p]) => t === 'item_combine' && p.result === 'full'))
  assert.deepEqual(await engine.combineItems('tube', 'liquid'), { ok: false }) // both were used up
})

console.log('devices')
const lamp = (extra = {}) => {
  const d = obj('device', 'lamp', extra)
  d.states = [{ id: 'off', name: '關', icon: '⚪' }, { id: 'on', name: '開', icon: '💡' }, { id: 'dim', name: '暗', icon: '🔅' }]
  d.initialState = 'off'
  return d
}
await test('a device starts in its initial state, cycles on click, runs the new state\'s events, and is logged', async () => {
  const m = mission([lamp({ onState: { on: [{ action: 'set_flag', flag: '亮了' }] } })])
  const { engine, logs } = await play(m)
  assert.equal(engine.state.devices.lamp, 'off')
  assert.equal(engine.check({ deviceStates: [{ target: 'lamp', state: 'off' }] }), true)
  await click(engine, 'lamp')
  assert.equal(engine.state.devices.lamp, 'on')
  assert.equal(engine.state.flags['亮了'], true)
  assert.ok(logs.some(([t, id, p]) => t === 'device_state' && id === 'lamp' && p.state === 'on'))
  await click(engine, 'lamp')
  await click(engine, 'lamp')
  assert.equal(engine.state.devices.lamp, 'off') // off -> on -> dim -> off
  assert.equal(engine.check({ deviceStates: [{ target: 'lamp', state: 'on' }] }), false)
})
await test('operateWhen blocks the click with a message; clickToCycle off lets only "set state" change it', async () => {
  const m = mission([lamp({ operateWhen: { allFlags: ['電源'] }, operateMessage: '沒有電' }), obj('hotspot', 'power', { onClick: [{ action: 'set_flag', flag: '電源' }] }), obj('hotspot', 'force', { onClick: [{ action: 'set_state', target: 'lamp', state: 'dim' }, { action: 'set_state', target: 'lamp', state: 'ghost' }, { action: 'set_state', target: 'nope', state: 'on' }] })])
  const { engine, messages } = await play(m)
  await click(engine, 'lamp')
  assert.deepEqual(messages, ['沒有電'])
  assert.equal(engine.state.devices.lamp, 'off')
  await click(engine, 'power')
  await click(engine, 'lamp')
  assert.equal(engine.state.devices.lamp, 'on')
  await click(engine, 'force') // a valid state works; unknown states and unknown devices are ignored
  assert.equal(engine.state.devices.lamp, 'dim')
  const m2 = mission([lamp({ clickToCycle: false })])
  const second = await play(m2)
  await click(second.engine, 'lamp')
  assert.equal(second.engine.state.devices.lamp, 'off')
})
await test('devices that trigger each other stop instead of looping forever', async () => {
  const a = lamp({ onState: { on: [{ action: 'set_state', target: 'lamp2', state: 'on' }] } })
  const b = { ...lamp({ onState: { on: [{ action: 'set_state', target: 'lamp', state: 'off' }, { action: 'set_state', target: 'lamp', state: 'on' }] } }), id: 'lamp2', name: 'lamp2' }
  const { engine } = await play(mission([a, b]))
  await click(engine, 'lamp') // must return
  assert.ok(['on', 'off'].includes(engine.state.devices.lamp))
})
await test('progress saved before devices existed resumes with every device in its starting state; a stage replay with reset puts devices and sockets back', async () => {
  const m = mission([lamp(), obj('socket', 'sk', { accepts: ['key'] }), obj('hotspot', 'g', { onClick: [{ action: 'add_item', itemId: 'key' }, { action: 'complete_stage' }] })])
  const { engine } = await play(m, { sceneId: 'sc', stageId: 's', flags: {} })
  assert.equal(engine.state.devices.lamp, 'off')
  await click(engine, 'lamp')
  await click(engine, 'g')
  await engine.useItemOnSocket('sk', 'key')
  assert.equal(engine.state.socketsDone.sk, true)
  const saved = JSON.parse(JSON.stringify(engine.serialize()))
  const resumed = new GameEngine({ mission: m, saved })
  assert.equal(resumed.state.devices.lamp, 'on')
  assert.equal(resumed.state.socketsDone.sk, true)
  m.stages[0].resetOnRetry = true
  const again = new GameEngine({ mission: m, saved })
  again.ui = { intro: async () => {}, message: async () => {}, toast: () => {} }
  await again.enterStage('s')
  assert.equal(again.state.devices.lamp, 'off')
  assert.equal(again.state.socketsDone.sk, undefined)
})

console.log('conditions')
await test('evalCondition and descriptions for items and devices; blank placeholders are ignored', () => {
  const view = { flags: {}, items: ['key'], objectivesDone: [], devices: { lamp: 'on' } }
  assert.equal(evalCondition({ hasItems: ['key'] }, view), true)
  assert.equal(evalCondition({ hasItems: ['key', 'tube'] }, view), false)
  assert.equal(evalCondition({ notHasItems: ['tube'] }, view), true)
  assert.equal(evalCondition({ notHasItems: ['key'] }, view), false)
  assert.equal(evalCondition({ hasItems: [''], deviceStates: [{ target: 'lamp', state: '' }, { target: '', state: '' }] }, view), true)
  assert.equal(evalCondition({ deviceStates: [{ target: 'lamp', state: 'on' }] }, view), true)
  assert.equal(evalCondition({ deviceStates: [{ target: 'lamp', state: 'off' }] }, view), false)
  assert.equal(isEmptyCondition({ hasItems: [''], deviceStates: [{ target: 'lamp', state: '' }] }), true)
  assert.equal(isEmptyCondition({ deviceStates: [{ target: 'lamp', state: 'on' }] }), false)
  const ctx = { items: [{ id: 'key', name: '鑰匙' }], devices: [{ id: 'lamp', name: '檯燈', states: [{ id: 'on', name: '開' }] }] }
  assert.equal(describeCondition({ hasItems: ['key'], deviceStates: [{ target: 'lamp', state: 'on' }] }, ctx), '學生證物袋裡有「鑰匙」，而且「檯燈」是「開」的狀態')
})

console.log('health check')
await test('catches broken item references, sockets, devices and combinations; warns about items nobody can get', () => {
  const bad = mission(
    [
      obj('icon', 'c1', { collectible: true, itemId: null }),
      obj('icon', 'c2', { collectible: true, itemId: 'ghost' }),
      obj('socket', 's1', { accepts: [] }),
      obj('socket', 's2', { accepts: ['ghost'], onMatch: [{ action: 'show_message', message: 'x' }] }),
      Object.assign(lamp(), { states: [{ id: 'only', name: '一個' }], initialState: 'only', onState: {} }),
      obj('hotspot', 'h', { onClick: [{ action: 'add_item', itemId: null }, { action: 'remove_item', itemId: 'ghost' }, { action: 'set_state', target: 'lamp', state: 'nope' }, { action: 'set_state', target: null, state: null }, { if: { hasItems: ['ghost'], deviceStates: [{ target: 'zzz', state: 'q' }] }, then: [], else: [] }] }),
    ],
    { combinations: [{ id: 'bad', a: 'key', b: 'key', result: 'full' }, { id: 'bad2', a: 'key', b: 'ghost', result: 'full' }] },
  )
  bad.stages[0].completeWhen = { allFlags: ['x'] }
  const r = checkMission(bad, new Set())
  const has = (list, part) => list.some((t) => t.includes(part))
  assert.ok(has(r.errors, '設成可以撿起，但還沒選'))
  assert.ok(has(r.errors, '撿起的物品已經從物品清單刪除'))
  assert.ok(has(r.errors, '還沒設定要放哪個物品'))
  assert.ok(has(r.errors, '接受的物品已經從物品清單刪除'))
  assert.ok(has(r.errors, '至少要有 2 個狀態'))
  assert.ok(has(r.errors, '「放進證物袋」還沒選物品'))
  assert.ok(has(r.errors, '「從證物袋拿走」指向不存在'))
  assert.ok(has(r.errors, '裝置上不存在的狀態'))
  assert.ok(has(r.errors, '「改變裝置狀態」還沒選裝置'))
  assert.ok(has(r.errors, '已經刪除的物品'))
  assert.ok(has(r.errors, '已經刪除的裝置或裝置狀態'))
  assert.ok(has(r.errors, '兩邊是同一個物品'))
  assert.ok(has(r.errors, '用到已經刪除（或還沒選）的物品'))
  assert.ok(has(r.warnings, '放對物品後什麼事都不會發生'))
  assert.ok(has(r.warnings, '物品「試管」沒有任何地方可以取得'))
  assert.equal(r.errors.length, r.errorWhere.length)
  assert.equal(r.warnings.length, r.warningWhere.length)
  const i = r.errors.findIndex((t) => t.includes('還沒設定要放哪個物品'))
  assert.deepEqual(r.errorWhere[i], { stageId: 's', sceneId: 'sc', objectId: 's1' })
})
await test('a clean items-and-sockets mission passes, and items obtained by pick-up, by event or by combination are not flagged', () => {
  const m = mission([
    obj('icon', 'k', { collectible: true, itemId: 'key' }),
    obj('hotspot', 'g', { onClick: [{ action: 'add_item', itemId: 'tube' }, { action: 'add_item', itemId: 'liquid' }] }),
    obj('socket', 'sk', { accepts: ['key'], onMatch: [{ action: 'complete_stage' }] }),
  ])
  const r = checkMission(m, new Set())
  assert.deepEqual(r.errors, [])
  assert.ok(!r.warnings.some((t) => t.includes('沒有任何地方可以取得'))) // "full" comes from the combination
})

console.log(`${passed} passed`)
