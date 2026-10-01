// Run with: npm test   (plain node, no browser or database needed)
import assert from 'node:assert/strict'
const base = '../src/'
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
const mk = (type, answer, extra = {}) => ({ id: 'lk', type: 'lock', ...L.lockDefaults(), answerType: type, answer, explanation: '<p>因為 …</p>', ...extra })
// every check runs on the clear lock AND on its protected copy, and must agree
const both = async (lock, input, expected, label) => {
  const clear = await L.checkAnswer(lock, input)
  const prot = await L.checkAnswer(await L.protectLock(lock), input)
  assert.equal(clear.correct, expected, `clear: ${label}`)
  assert.equal(prot.correct, expected, `protected: ${label}`)
  assert.deepEqual(prot, clear, `same result both ways: ${label}`)
  return clear
}

console.log('text')
await test('normalization: subscripts, full-width, case, spaces, punctuation', () => {
  assert.equal(L.normalizeText('H₂O'), 'h2o')
  assert.equal(L.normalizeText(' Ｈ２Ｏ。'), 'h2o')
  assert.equal(L.normalizeText('Fe³⁺'), 'fe3+')
  assert.equal(L.normalizeText('Co', { ...L.TEXT_OPTIONS_DEFAULT, ignoreCase: false }), 'Co')
  assert.equal(L.normalizeText('CO', { ...L.TEXT_OPTIONS_DEFAULT, ignoreCase: false }), 'CO')
})
await test('text answers, several accepted, options respected', async () => {
  const lock = mk('text', { accepted: ['H₂O', '水'], options: { ...L.TEXT_OPTIONS_DEFAULT } })
  await both(lock, 'h2o', true, 'h2o')
  await both(lock, ' 水 ', true, '水')
  await both(lock, 'H2O2', false, 'H2O2')
  const strict = mk('text', { accepted: ['NaCl'], options: { ...L.TEXT_OPTIONS_DEFAULT, ignoreCase: false } })
  await both(strict, 'NaCl', true, 'exact')
  await both(strict, 'nacl', false, 'case matters')
})

console.log('number')
await test('number with absolute and percent tolerance and units', async () => {
  const lock = mk('number', { value: 0.1, tolerance: { type: 'abs', amount: 0.005 }, units: ['M', 'mol/L'], requireUnit: true })
  await both(lock, { value: '0.1', unit: 'M' }, true, 'exact')
  await both(lock, { value: '0.104', unit: 'mol/L' }, true, 'in tolerance')
  await both(lock, { value: '0.11', unit: 'M' }, false, 'out of tolerance')
  await both(lock, { value: '0.1', unit: '' }, false, 'unit required')
  await both(lock, { value: '0.1', unit: 'g' }, false, 'wrong unit')
  await both(lock, { value: 'abc', unit: 'M' }, false, 'not a number')
  const pct = mk('number', { value: 200, tolerance: { type: 'pct', amount: 5 }, units: [], requireUnit: false })
  await both(pct, { value: '209', unit: '' }, true, '5% of 200')
  await both(pct, { value: '211', unit: '' }, false, 'over 5%')
  await both(pct, { value: '２００', unit: '' }, true, 'full-width digits')
  const optionalUnit = mk('number', { value: 7, tolerance: { type: 'abs', amount: 0 }, units: ['pH'], requireUnit: false })
  await both(optionalUnit, { value: '7', unit: '' }, true, 'unit optional and missing')
  await both(optionalUnit, { value: '7', unit: 'x' }, false, 'unit given but wrong')
})

console.log('choice types')
await test('choice and multiChoice', async () => {
  const opts = ['a', 'b', 'c'].map((t) => ({ id: 'o_' + t, text: t, assetId: null }))
  await both(mk('choice', { options: opts, correct: 'o_b' }), 'o_b', true, 'right')
  await both(mk('choice', { options: opts, correct: 'o_b' }), 'o_a', false, 'wrong')
  const m = mk('multiChoice', { options: opts, correct: ['o_a', 'o_c'] })
  await both(m, ['o_c', 'o_a'], true, 'any order')
  await both(m, ['o_a'], false, 'missing one')
  await both(m, ['o_a', 'o_b', 'o_c'], false, 'extra')
  await both(m, [], false, 'empty')
})

console.log('match / order / categorize')
await test('match with partial counting', async () => {
  const pairs = ['x', 'y', 'z'].map((k) => ({ id: 'pr_' + k, left: { text: 'L' + k, assetId: null }, right: { text: 'R' + k, assetId: null } }))
  const lock = mk('match', { pairs })
  const good = pairs.map((p) => ({ left: p.id + ':L', right: p.id + ':R' }))
  await both(lock, good, true, 'all right')
  const swapped = [
    { left: 'pr_x:L', right: 'pr_y:R' },
    { left: 'pr_y:L', right: 'pr_x:R' },
    { left: 'pr_z:L', right: 'pr_z:R' },
  ]
  const r = await both(lock, swapped, false, 'two swapped')
  assert.deepEqual([r.right, r.total], [1, 3])
  await both(lock, good.slice(0, 2), false, 'incomplete')
  const prot = await L.protectLock(lock)
  assert.ok(!JSON.stringify(prot).includes('"pairs"'), 'pairs removed')
  const view = L.lockView(prot)
  assert.equal(view.lefts.length, 3)
  assert.equal(view.rights.length, 3)
})
await test('order with partial counting', async () => {
  const items = ['a', 'b', 'c', 'd'].map((t) => ({ id: 'it_' + t, text: t, assetId: null }))
  const lock = mk('order', { items })
  await both(lock, ['it_a', 'it_b', 'it_c', 'it_d'], true, 'right order')
  const r = await both(lock, ['it_b', 'it_a', 'it_c', 'it_d'], false, 'first two swapped')
  assert.deepEqual([r.right, r.total], [2, 4])
  const prot = await L.protectLock(lock)
  assert.deepEqual(prot.answer.items.map((i) => i.id), [...prot.answer.items.map((i) => i.id)].sort(), 'stored order carries no hint')
})
await test('categorize', async () => {
  const lock = mk('categorize', {
    categories: [{ id: 'c1', name: '酸' }, { id: 'c2', name: '鹼' }],
    items: [
      { id: 'i1', text: 'HCl', assetId: null, categoryId: 'c1' },
      { id: 'i2', text: 'NaOH', assetId: null, categoryId: 'c2' },
    ],
  })
  await both(lock, { i1: 'c1', i2: 'c2' }, true, 'right')
  const r = await both(lock, { i1: 'c2', i2: 'c2' }, false, 'one wrong')
  assert.deepEqual([r.right, r.total], [1, 2])
  await both(lock, { i1: 'c1' }, false, 'not all placed')
  assert.ok(!JSON.stringify((await L.protectLock(lock)).answer).includes('categoryId'))
})

console.log('hotspot / dial / direction')
await test('hotspot any / all', async () => {
  const any = mk('hotspot', { assetId: 'a', regions: [{ x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, { x: 0.6, y: 0.6, w: 0.2, h: 0.2 }], mode: 'any' })
  await both(any, [{ x: 0.15, y: 0.15 }], true, 'in region 1')
  await both(any, [{ x: 0.7, y: 0.7 }], true, 'in region 2')
  await both(any, [{ x: 0.4, y: 0.4 }], false, 'outside')
  const all = { ...any, answer: { ...any.answer, mode: 'all' } }
  await both(all, [{ x: 0.15, y: 0.15 }, { x: 0.7, y: 0.7 }], true, 'both found')
  const r = await both(all, [{ x: 0.15, y: 0.15 }], false, 'only one')
  assert.deepEqual([r.right, r.total], [1, 2])
  await both(all, [{ x: 0.15, y: 0.15 }, { x: 0.16, y: 0.16 }], false, 'two in the same region')
})
await test('dial and direction', async () => {
  await both(mk('dial', { cells: 3, charset: 'custom', custom: ['H', 'He', 'Li'], value: ['He', 'H', 'Li'] }), ['He', 'H', 'Li'], true, 'element dial')
  await both(mk('dial', { cells: 3, charset: 'digits', custom: [], value: ['1', '2', '3'] }), ['1', '2', '4'], false, 'wrong dial')
  await both(mk('direction', { sequence: ['up', 'left', 'left'] }), ['up', 'left', 'left'], true, 'sequence')
  await both(mk('direction', { sequence: ['up', 'left'] }), ['left', 'up'], false, 'order matters')
})

console.log('protection')
await test('protected lock holds no readable answer, and the explanation decrypts', async () => {
  const lock = mk('text', { accepted: ['秘密答案'], options: { ...L.TEXT_OPTIONS_DEFAULT } }, { explanation: '<p>解析：因為氫鍵</p>' })
  const prot = await L.protectLock(lock)
  const json = JSON.stringify(prot)
  assert.ok(!json.includes('秘密答案') && !json.includes('氫鍵'))
  assert.equal(await L.getExplanation(prot), '<p>解析：因為氫鍵</p>')
  assert.equal(await L.getExplanation(lock), '<p>解析：因為氫鍵</p>') // the draft still has it in the clear
  assert.notDeepEqual(prot.sealed.hashes, (await L.protectLock(lock)).sealed.hashes) // a fresh salt each time
  const num = await L.protectLock(mk('number', { value: 7.25, tolerance: { type: 'abs', amount: 0 }, units: [], requireUnit: false }))
  assert.ok(!JSON.stringify(num).includes('7.25'))
})
await test('protectMission protects every lock and leaves the draft untouched', async () => {
  const data = { stages: [{ scenes: [{ objects: [{ id: 'x', type: 'icon' }, mk('text', { accepted: ['abc'], options: { ...L.TEXT_OPTIONS_DEFAULT } })] }] }] }
  const out = await L.protectMission(data)
  assert.ok(!JSON.stringify(out).includes('abc'))
  assert.equal(data.stages[0].scenes[0].objects[1].answer.accepted[0], 'abc')
  assert.equal(out.stages[0].scenes[0].objects[0].type, 'icon')
})
await test('wrong-answer feedback and logging summaries', () => {
  const lock = mk('text', { accepted: ['a'], options: { ...L.TEXT_OPTIONS_DEFAULT } }, { wrongFeedback: [{ match: 'H2', message: '那是氫氣' }] })
  assert.equal(L.pickWrongFeedback(lock, 'h₂'), '那是氫氣')
  assert.equal(L.pickWrongFeedback(lock, 'x'), null)
  const num = mk('number', { value: 1, tolerance: { type: 'abs', amount: 0 }, units: [], requireUnit: false }, { wrongFeedback: [{ match: '0.01', message: '單位換算再檢查一次' }] })
  assert.equal(L.pickWrongFeedback(num, { value: '0.01', unit: '' }), '單位換算再檢查一次')
  assert.equal(L.summarizeInput(num, { value: '5', unit: 'M' }), '5 M')
})

console.log('health check')
await test('validateLock explains what is missing', () => {
  assert.equal(L.validateLock(mk('text', { accepted: [''], options: {} })).errors.length, 1)
  assert.ok(L.validateLock(mk('choice', { options: [{ id: 'a', text: 'x' }, { id: 'b', text: 'y' }], correct: null })).errors[0].includes('正確答案'))
  assert.equal(L.validateLock(mk('direction', { sequence: ['up'] }, { prompt: '<p>q</p>', hints: ['h'], onSuccess: [{ action: 'complete_stage' }] })).errors.length, 0)
  const w = L.validateLock(mk('direction', { sequence: ['up'] }, { prompt: '', hints: ['', '', ''], explanation: '' })).warnings.join('|')
  for (const part of ['題目還是空的', '沒有任何提示', '還沒寫解析', '沒有任何事會發生']) assert.ok(w.includes(part), part)
  assert.ok(L.validateLock(mk('hotspot', { assetId: 'a', regions: [], mode: 'any' })).errors[0].includes('畫出'))
})
console.log(`\n${passed} passed`)
