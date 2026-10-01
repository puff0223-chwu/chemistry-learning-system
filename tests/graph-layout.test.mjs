// Run with: npm test   (plain node, no browser or database needed)
import assert from 'node:assert/strict'
import { GRID_STEP, autoLayout } from '../src/editor/graphLayout.js'

let passed = 0
const test = (name, fn) => {
  try {
    fn()
    passed++
    console.log('  ok  ', name)
  } catch (e) {
    console.log('  FAIL', name, '\n     ', e.message)
    process.exitCode = 1
  }
}

const exits = (o = {}) => ({ up: null, down: null, left: null, right: null, forward: null, backward: null, ...o })
const scene = (id, e = {}) => ({ sceneId: id, name: id, exits: exits(e) })
const cell = { w: 100, h: 100 }

test('a scene to the right really sits to the right, one to the left to the left', () => {
  const pos = autoLayout([scene('A', { right: 'B', left: 'C' }), scene('B'), scene('C')], 'A', cell)
  assert.ok(pos.B.x > pos.A.x && pos.B.y === pos.A.y)
  assert.ok(pos.C.x < pos.A.x && pos.C.y === pos.A.y)
})

test('up goes up and down goes down; forward is up-right and backward is down-left', () => {
  const pos = autoLayout([scene('A', { up: 'U', down: 'D', forward: 'F', backward: 'K' }), scene('U'), scene('D'), scene('F'), scene('K')], 'A', cell)
  assert.ok(pos.U.y < pos.A.y && pos.U.x === pos.A.x)
  assert.ok(pos.D.y > pos.A.y && pos.D.x === pos.A.x)
  assert.ok(pos.F.x > pos.A.x && pos.F.y < pos.A.y)
  assert.ok(pos.K.x < pos.A.x && pos.K.y > pos.A.y)
  assert.deepEqual(Object.keys(GRID_STEP).sort(), ['backward', 'down', 'forward', 'left', 'right', 'up'])
})

test('no two scenes ever share a spot, even when the exits would collide', () => {
  // A goes right to B and also forward then down: both want the same cell
  const scenes = [scene('A', { right: 'B', forward: 'C' }), scene('B', { up: 'D' }), scene('C', { down: 'D' }), scene('D')]
  const pos = autoLayout(scenes, 'A', cell)
  const spots = Object.values(pos).map((p) => `${p.x},${p.y}`)
  assert.equal(new Set(spots).size, scenes.length)
})

test('scenes nobody can reach are still placed, on their own row below', () => {
  const pos = autoLayout([scene('A', { right: 'B' }), scene('B'), scene('X'), scene('Y', { right: 'Z' }), scene('Z')], 'A', cell)
  assert.equal(Object.keys(pos).length, 5)
  assert.ok(pos.X.y > pos.A.y && pos.Y.y > pos.A.y)
  assert.ok(pos.Z.x > pos.Y.x && pos.Z.y === pos.Y.y)
})

test('the top-left scene lands on (0, 0) and every position is a whole number of cells', () => {
  const pos = autoLayout([scene('A', { left: 'B', up: 'C' }), scene('B'), scene('C')], 'A', cell)
  assert.equal(Math.min(...Object.values(pos).map((p) => p.x)), 0)
  assert.equal(Math.min(...Object.values(pos).map((p) => p.y)), 0)
  assert.ok(Object.values(pos).every((p) => p.x % 100 === 0 && p.y % 100 === 0))
})

test('exits to scenes that no longer exist are ignored', () => {
  const pos = autoLayout([scene('A', { right: 'GONE' })], 'A', cell)
  assert.deepEqual(Object.keys(pos), ['A'])
})
console.log(`\n${passed} passed`)
