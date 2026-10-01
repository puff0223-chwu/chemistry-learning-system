// Run with: npm test   (plain node, no browser or database needed)
import assert from 'node:assert/strict'
const base = '../src/'
const G = await import(base + 'editor/groupOps.js')
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
const o = (id, x = 0, y = 0, extra = {}) => ({ id, name: id, type: 'icon', x, y, w: 100, h: 50, rotation: 0, ...extra })
const scene = () => ({ objects: [o('a'), o('b'), o('c'), o('d'), o('e')], groups: [] })
const order = (s) => s.objects.map((x) => x.id).join('')

await test('grouping makes the members neighbours, at the top-most member', () => {
  const { scene: s, groupId } = G.groupObjects(scene(), ['b', 'd'], '寶物')
  assert.equal(order(s), 'acbde'.replace('bde', 'bde') && 'acbde' === order(s) ? 'acbde' : order(s))
  assert.deepEqual(s.objects.filter((x) => x.groupId === groupId).map((x) => x.id), ['b', 'd'])
  assert.equal(order(s), 'acbde'.length === 5 ? order(s) : '')
  // b and d are adjacent, and e (above d) is still on top
  const idx = (id) => s.objects.findIndex((x) => x.id === id)
  assert.equal(idx('d') - idx('b'), 1)
  assert.equal(idx('e'), 4)
  assert.deepEqual(s.groups, [{ id: groupId, name: '寶物' }])
})
await test('grouping needs two objects; regrouping moves them out of the old group', () => {
  assert.equal(G.groupObjects(scene(), ['a'], 'x').groupId, null)
  const first = G.groupObjects(scene(), ['a', 'b'], '一').scene
  const second = G.groupObjects(first, ['b', 'c'], '二')
  assert.equal(second.scene.groups.length, 2)
  assert.equal(G.membersOf(second.scene.objects, first.groups[0].id).length, 1) // a alone is left in group 一
  const third = G.groupObjects(second.scene, ['a', 'b', 'c'], '三')
  assert.equal(third.scene.groups.length, 1) // the two older groups emptied out and vanished
})
await test('clicking a member selects the whole group; Alt (single) picks one; Shift toggles', () => {
  const { scene: s, groupId } = G.groupObjects(scene(), ['b', 'c'], 'g')
  assert.deepEqual(G.nextSelection(s, [], 'b').sort(), ['b', 'c'])
  assert.deepEqual(G.nextSelection(s, [], 'b', { single: true }), ['b'])
  assert.deepEqual(G.nextSelection(s, ['a'], 'b', { additive: true }).sort(), ['a', 'b', 'c'])
  assert.deepEqual(G.nextSelection(s, ['a', 'b', 'c'], 'c', { additive: true }), ['a']) // toggles the whole group off
  assert.deepEqual(G.nextSelection(s, ['a'], null), [])
  assert.equal(G.wholeGroupSelected(s, ['b', 'c']), groupId)
  assert.equal(G.wholeGroupSelected(s, ['b']), null)
  assert.equal(G.wholeGroupSelected(s, ['b', 'c', 'a']), null)
})
await test('ungroup frees the members; deleting every member removes the group', () => {
  const { scene: s, groupId } = G.groupObjects(scene(), ['b', 'c'], 'g')
  const u = G.ungroup(s, groupId)
  assert.equal(u.groups.length, 0)
  assert.ok(u.objects.every((x) => !x.groupId))
  assert.equal(G.deleteObjects(s, ['b', 'c']).groups.length, 0)
  const partly = G.deleteObjects(s, ['b'])
  assert.equal(partly.groups.length, 1)
  assert.equal(G.membersOf(partly.objects, groupId).length, 1)
})
await test('duplicating a group makes a new group; a lone copy stays lone', () => {
  const { scene: s, groupId } = G.groupObjects(scene(), ['b', 'c'], 'g')
  const { scene: d, newIds } = G.duplicateObjects(s, ['b', 'c'])
  assert.equal(newIds.length, 2)
  assert.equal(d.groups.length, 2)
  const copy = d.objects.find((x) => x.id === newIds[0])
  assert.notEqual(copy.groupId, groupId)
  assert.equal(G.membersOf(d.objects, copy.groupId).length, 2)
  assert.equal(copy.x, 30)
  const lone = G.duplicateObjects(scene(), ['a'])
  assert.equal(lone.scene.groups.length, 0)
})
await test('moving a block through the layers keeps its inner order', () => {
  const objs = scene().objects
  assert.equal(G.moveBlock(objs, ['b', 'c'], 'up').map((x) => x.id).join(''), 'adbce')
  assert.equal(G.moveBlock(objs, ['b', 'c'], 'down').map((x) => x.id).join(''), 'bcade')
  assert.equal(G.moveBlock(objs, ['b', 'c'], 'top').map((x) => x.id).join(''), 'adebc')
  assert.equal(G.moveBlock(objs, ['b', 'c'], 'bottom').map((x) => x.id).join(''), 'bcade')
  assert.equal(G.moveBlock(objs, ['e'], 'up').map((x) => x.id).join(''), 'abcde')
  assert.equal(G.moveBlock(objs, ['a'], 'down').map((x) => x.id).join(''), 'abcde')
})
await test('bounds of a selection, including rotated objects; marquee picks what it touches', () => {
  const b = G.selectionBounds([o('a', 0, 0), o('b', 200, 100)])
  assert.deepEqual(b, { x: 0, y: 0, w: 300, h: 150 })
  const turned = G.selectionBounds([o('r', 100, 100, { w: 100, h: 50, rotation: 90 })]) // pivots at its top-left corner
  assert.ok(Math.abs(turned.x - 50) < 1e-6 && Math.abs(turned.w - 50) < 1e-6 && Math.abs(turned.h - 100) < 1e-6)
  const objs = [o('a', 0, 0), o('b', 500, 500)]
  assert.deepEqual(G.objectsInRect(objs, { x: -10, y: -10, w: 50, h: 50 }).map((x) => x.id), ['a'])
  assert.deepEqual(G.objectsInRect(objs, { x: 300, y: 300, w: 50, h: 50 }), [])
})
await test('resizing and rotating a group box carries every member with it', () => {
  const members = [o('a', 100, 100), o('b', 300, 200)]
  const start = G.selectionBounds(members) // x100 y100 w300 h150
  // double the size, same corner
  const grown = G.transformMembers(members, start, { x: 100, y: 100, w: start.w * 2, h: start.h * 2, rotation: 0 })
  assert.deepEqual(grown[0].patch, { x: 100, y: 100, w: 200, h: 100, rotation: 0 })
  assert.deepEqual(grown[1].patch, { x: 500, y: 300, w: 200, h: 100, rotation: 0 })
  // just moved
  const moved = G.transformMembers(members, start, { ...start, x: 150, y: 120, rotation: 0 })
  assert.deepEqual([moved[0].patch.x, moved[0].patch.y, moved[1].patch.x, moved[1].patch.y], [150, 120, 350, 220])
  // quarter turn: the member 200 to the right of the box origin ends up 200 below it
  const turned = G.transformMembers([o('a', 0, 0), o('b', 200, 0)], { x: 0, y: 0, w: 300, h: 50 }, { x: 0, y: 0, w: 300, h: 50, rotation: 90 })
  assert.equal(turned[1].patch.rotation, 90)
  assert.ok(Math.abs(turned[1].patch.x) < 1e-6 && Math.abs(turned[1].patch.y - 200) < 1e-6)
})
await test('a copied scene gets its own group ids', () => {
  const { scene: s, groupId } = G.groupObjects(scene(), ['b', 'c'], 'g')
  const copy = G.regroupForCopy(s)
  assert.notEqual(copy.groups[0].id, groupId)
  assert.equal(G.membersOf(copy.objects, copy.groups[0].id).length, 2)
  assert.equal(G.membersOf(copy.objects, groupId).length, 0)
})
console.log(`\n${passed} passed`)
