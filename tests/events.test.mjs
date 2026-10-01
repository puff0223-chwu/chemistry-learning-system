// Run with: npm test   (plain node, no browser or database needed)
import assert from 'node:assert/strict'
const base = '../src/'
const ev = await import(base + 'lib/missionEvents.js')
const { searchIcons, ICON_LIBRARY, iconName } = await import(base + 'editor/icons.js')
let passed = 0
const test = async (n, f) => { try { await f(); passed++; console.log('  ok  ', n) } catch (e) { console.log('  FAIL', n, '\n     ', e.message); process.exitCode = 1 } }

const data = { stages: [{ stageId: 's', completeWhen: { allFlags: ['找到全部線索'] }, onComplete: [], scenes: [
  { sceneId: 'A', name: '客廳', exits: {}, exitConditions: { right: { when: { notFlags: ['拿到鑰匙'] }, message: 'x' } }, onEnter: [{ if: { notFlags: ['去過客廳'] }, then: [{ action: 'set_flag', flag: '去過客廳' }], else: [] }],
    objects: [
      { id: 'k', name: '鑰匙', onClick: [{ action: 'set_flag', flag: '拿到鑰匙' }, { action: 'complete_stage' }], visible: true },
      { id: 'd', name: '門', showWhen: { allFlags: ['拿到鑰匙'], anyFlags: ['', 'x'] }, visible: true },
    ] }] }] }

await test('flagUsage reports where markers are remembered and checked', () => {
  const u = ev.flagUsage(data)
  assert.deepEqual([...u.keys()].sort(), ['x', '找到全部線索', '拿到鑰匙', '去過客廳'].sort())
  assert.equal(u.get('拿到鑰匙').sets.length, 1)
  assert.ok(u.get('拿到鑰匙').uses.length >= 2)
  assert.equal(u.get('找到全部線索').sets.length, 0)
})
await test('renameFlag rewrites events and conditions, leaves the original untouched', () => {
  const next = ev.renameFlag(data, '拿到鑰匙', '拿到銅鑰匙')
  const names = [...ev.flagUsage(next).keys()]
  assert.ok(names.includes('拿到銅鑰匙') && !names.includes('拿到鑰匙'))
  assert.ok(ev.flagUsage(data).has('拿到鑰匙')) // original unchanged
  assert.equal(next.stages[0].scenes[0].objects[0].onClick[0].flag, '拿到銅鑰匙')
  assert.deepEqual(next.stages[0].scenes[0].exitConditions.right.when.notFlags, ['拿到銅鑰匙'])
})
await test('empty placeholder names are ignored by the game', () => {
  const view = { flags: { x: true }, items: [], objectivesDone: [], notebookCount: 0, elapsedSeconds: 0 }
  assert.equal(ev.evalCondition({ allFlags: [''] }, view), true)
  assert.equal(ev.isEmptyCondition({ allFlags: [''] }), true)
  assert.equal(ev.evalCondition({ allFlags: ['', 'x'] }, view), true)
  assert.equal(ev.evalCondition({ allFlags: ['', 'y'] }, view), false)
})
await test('describeCondition reads like a sentence', () => {
  assert.equal(ev.describeCondition(null), '沒有任何限制')
  assert.equal(ev.describeCondition({ allFlags: ['拿到鑰匙'], notFlags: ['打開門'] }), '學生已經「拿到鑰匙」，而且還沒「打開門」')
  assert.equal(ev.describeCondition({ elapsedSecondsAtLeast: 30 }), '學生遊戲開始超過 30 秒')
})
await test('completionSources lists where an event finishes the stage', () => {
  assert.deepEqual(ev.completionSources(data), ['場景「客廳」的「鑰匙」被點擊時'])
})
await test('describeAction uses names, not ids', () => {
  const ctx = { scenes: [{ sceneId: 'A', name: '客廳' }], objects: [{ id: 'k', name: '鑰匙' }] }
  assert.equal(ev.describeAction({ action: 'hide_object', target: 'k' }, ctx), '讓「鑰匙」消失')
  assert.equal(ev.describeAction({ action: 'goto_scene', sceneId: 'A' }, ctx), '去「客廳」')
})
await test('icon library is large, searchable in Chinese, and every entry has an emoji and a name', () => {
  assert.ok(ICON_LIBRARY.length >= 250, `only ${ICON_LIBRARY.length}`)
  assert.ok(ICON_LIBRARY.every((i) => i.emoji && i.words.length > 0))
  assert.ok(searchIcons('鑰匙').some((i) => i.emoji === '🔑'))
  assert.ok(searchIcons('顯微').some((i) => i.emoji === '🔬'))
  assert.ok(searchIcons('血').some((i) => i.emoji === '🩸'))
  assert.equal(iconName('🔑'), '鑰匙')
  assert.equal(searchIcons('不存在的詞zzz').length, 0)
})
console.log(`\n${passed} passed`)
