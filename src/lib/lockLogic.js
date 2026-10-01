// Answer locks (spec-v5 §9): answer types, default shapes, checking, and answer protection (§4.4).
// Pure functions only (no React, no Supabase), so everything here can be tested directly with node.
//
// A lock lives in a scene as an object of type 'lock'. In the draft its answer is stored in the clear;
// when a mission is published, protectLock() swaps the answers for salted SHA-256 hashes (and encrypts the
// explanation), so a student who opens the browser's developer tools cannot simply read them.
// checkAnswer() works on both forms, so the editor preview and the real game use the same code.
// The goal is to stop casual peeking, not bank-grade secrecy (the decryption key travels with the data).

const rid = () => Math.random().toString(36).slice(2, 8)

export const ANSWER_TYPES = [
  { type: 'text', icon: '✏️', label: '打字回答', desc: '學生輸入文字，例如密碼、物質名稱、化學式' },
  { type: 'number', icon: '🔢', label: '輸入數值', desc: '濃度、pH、質量的計算題，可設誤差與單位' },
  { type: 'choice', icon: '🔘', label: '單選題', desc: '從幾個選項中選一個' },
  { type: 'multiChoice', icon: '☑️', label: '複選題', desc: '勾選所有正確的選項' },
  { type: 'match', icon: '🔗', label: '配對', desc: '把左邊和右邊對起來，例如器材圖配名稱' },
  { type: 'order', icon: '↕️', label: '排順序', desc: '把步驟排成正確的順序，例如配藥流程' },
  { type: 'categorize', icon: '🗂️', label: '分類', desc: '把卡片放進分類框，例如酸／鹼／中性' },
  { type: 'hotspot', icon: '🎯', label: '點圖片位置', desc: '在圖片上點出正確的地方，例如找出違規處' },
  { type: 'dial', icon: '🎰', label: '轉盤密碼', desc: '每一格上下轉，像密碼鎖' },
  { type: 'direction', icon: '🧭', label: '方向鎖', desc: '依序按上下左右' },
]
export const answerTypeMeta = (type) => ANSWER_TYPES.find((t) => t.type === type)

export const DIAL_CHARSETS = {
  digits: { label: '數字 0–9', chars: [...'0123456789'] },
  letters: { label: '英文字母 A–Z', chars: [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'] },
}
export const dialChars = (answer) => (answer.charset === 'custom' ? answer.custom.filter(Boolean) : (DIAL_CHARSETS[answer.charset] ?? DIAL_CHARSETS.digits).chars)

export const TEXT_OPTIONS_DEFAULT = { ignoreCase: true, fullHalf: true, trim: true, punctuation: true, chemSubscript: true }

const newOption = (text = '') => ({ id: `op_${rid()}`, text, assetId: null })

export function newAnswer(type) {
  switch (type) {
    case 'text':
      return { accepted: [''], options: { ...TEXT_OPTIONS_DEFAULT } }
    case 'number':
      return { value: null, tolerance: { type: 'abs', amount: 0 }, units: [], requireUnit: false }
    case 'choice':
      return { options: [newOption(), newOption()], correct: null }
    case 'multiChoice':
      return { options: [newOption(), newOption(), newOption()], correct: [] }
    case 'match':
      return { pairs: [1, 2, 3].map(() => ({ id: `pr_${rid()}`, left: { text: '', assetId: null }, right: { text: '', assetId: null } })) }
    case 'order':
      return { items: [newOption(), newOption(), newOption()] }
    case 'categorize':
      return { categories: [{ id: `ct_${rid()}`, name: '' }, { id: `ct_${rid()}`, name: '' }], items: [] }
    case 'hotspot':
      return { assetId: null, regions: [], mode: 'any' }
    case 'dial':
      return { cells: 3, charset: 'digits', custom: [], value: ['0', '0', '0'] }
    case 'direction':
      return { sequence: [] }
    default:
      return {}
  }
}

// Fields every lock has (besides the common object fields) — spec-v5 §9.1.
export function lockDefaults() {
  return {
    appearance: 'icon', // 'icon' = a visible lock the student taps; 'invisible' = lies over a picture like a hotspot
    icon: '🔒',
    prompt: '',
    answerType: 'text',
    answer: newAnswer('text'),
    hintMode: 'onWrong', // 'onWrong' = a hint appears after each wrong answer; 'onRequest' = student asks for hints
    hints: ['', '', ''],
    giveUp: { enabled: true, afterAttempts: 3 },
    explanation: '',
    wrongFeedback: [],
    partialMode: 'all', // match / order / categorize / hotspot(all): 'all' = must be fully right; 'count' = tell how many are right
    onSuccess: [],
    onGiveUp: [],
    lockAfterSolved: true,
  }
}

// ---------------------------------------------------------------- text and number handling

const SUBSCRIPTS = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9', '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '₊': '+', '₋': '-', '⁺': '+', '⁻': '-' }
const PUNCT = /[\s,，。、；;：:！!？?「」『』“”"'‘’()（）［］[\]{}《》<>~～·・]/g

// Makes "H₂O", "h2o ", "Ｈ２Ｏ" comparable. Each step can be switched off per lock (spec §9.2).
export function normalizeText(input, o = TEXT_OPTIONS_DEFAULT) {
  let t = String(input ?? '')
  if (o.chemSubscript) t = t.replace(/[₀-₉⁰-⁹₊₋⁺⁻]/g, (c) => SUBSCRIPTS[c] ?? c)
  if (o.fullHalf) t = t.normalize('NFKC')
  if (o.ignoreCase) t = t.toLowerCase()
  if (o.punctuation) t = t.replace(PUNCT, '')
  else if (o.trim) t = t.trim().replace(/\s+/g, ' ')
  else t = t.replace(/\s+/g, ' ')
  return t
}

export function parseNumber(input) {
  const t = String(input ?? '').normalize('NFKC').replace(/[,\s]/g, '').replace(/[−–—]/g, '-')
  if (t === '' || !/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(t)) return NaN
  return Number(t)
}

const unitKey = (u) => normalizeText(u, { ignoreCase: false, fullHalf: true, trim: true, punctuation: true, chemSubscript: true })

// Absolute tolerance for a number answer.
function toleranceOf(answer) {
  const v = answer.value
  const amount = Math.abs(Number(answer.tolerance?.amount) || 0)
  return answer.tolerance?.type === 'pct' ? (Math.abs(v) * amount) / 100 : amount
}

// ---------------------------------------------------------------- hashing / encryption

const encoder = new TextEncoder()
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

export async function sha256Hex(text) {
  return toHex(await crypto.subtle.digest('SHA-256', encoder.encode(text)))
}

export function randomSalt() {
  return toHex(crypto.getRandomValues(new Uint8Array(16)))
}

const hashToken = (salt, token) => sha256Hex(`${salt}\u0000${token}`)

// Numbers are stored shifted by a salt-derived offset: not readable at a glance, easy to undo in code.
const saltOffset = (salt) => parseInt(salt.slice(0, 8), 16) * 1000003
const encodeNumber = (n, salt) => String(Math.round(n * 1e6) + saltOffset(salt))
const decodeNumber = (s, salt) => (Number(s) - saltOffset(salt)) / 1e6

const toBase64 = (bytes) => btoa(String.fromCharCode(...bytes))
const fromBase64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function explainKey(salt, usage) {
  const raw = await crypto.subtle.digest('SHA-256', encoder.encode(`${salt}|explain`))
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, [usage])
}

async function sealText(text, salt) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await explainKey(salt, 'encrypt'), encoder.encode(text))
  return { iv: toBase64(iv), data: toBase64(new Uint8Array(data)) }
}

// The explanation / full answer, shown only when the student presses "我真的不會".
export async function getExplanation(lock) {
  if (lock.explanation) return lock.explanation
  if (!lock.explanationSealed) return ''
  const { iv, data } = lock.explanationSealed
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(iv) }, await explainKey(lock.sealed.salt, 'decrypt'), fromBase64(data))
  return new TextDecoder().decode(plain)
}

export const isProtected = (lock) => !!lock.sealed

// ---------------------------------------------------------------- tokens: what counts as "the right thing"

const matchToken = (leftId, rightId) => `${leftId}>${rightId}`
const leftId = (pair) => `${pair.id}:L`
const rightId = (pair) => `${pair.id}:R`

// For the types built from "tokens" (text, choice, match, ...): the list of correct tokens, from the clear answer.
function plainTokens(lock) {
  const a = lock.answer
  switch (lock.answerType) {
    case 'text':
      return a.accepted.map((s) => normalizeText(s, a.options)).filter(Boolean)
    case 'choice':
      return [a.correct]
    case 'multiChoice':
      return [[...a.correct].sort().join(',')]
    case 'match':
      return a.pairs.map((p) => matchToken(leftId(p), rightId(p)))
    case 'order':
      return a.items.map((it, i) => `${i}:${it.id}`)
    case 'categorize':
      return a.items.map((it) => `${it.id}>${it.categoryId}`)
    case 'dial':
      return [a.value.join('|')]
    case 'direction':
      return [a.sequence.join(',')]
    default:
      return []
  }
}

// Answers a "is this token one of the correct ones?" question, whether the lock is in the clear or protected.
async function tokenChecker(lock) {
  if (isProtected(lock)) {
    const { salt, hashes } = lock.sealed
    const set = new Set(hashes)
    return async (token) => set.has(await hashToken(salt, token))
  }
  const set = new Set(plainTokens(lock))
  return async (token) => set.has(token)
}

const pointInRect = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h

function regionsOf(lock) {
  if (!isProtected(lock)) return lock.answer.regions
  const { salt, regions } = lock.sealed
  return regions.map((r) => ({ x: decodeNumber(r[0], salt), y: decodeNumber(r[1], salt), w: decodeNumber(r[2], salt), h: decodeNumber(r[3], salt) }))
}

// ---------------------------------------------------------------- checking

// input by type:
//   text: string · number: { value, unit } · choice: optionId · multiChoice: [optionId] · match: [{ left, right }]
//   order: [itemId in the student's order] · categorize: { itemId: categoryId } · hotspot: [{ x, y }] (0–1) · dial: [value] · direction: [dir]
// Returns { correct, right, total }; right/total are only interesting for the "show how many are right" types.
export async function checkAnswer(lock, input) {
  const type = lock.answerType
  const whole = (ok) => ({ correct: ok, right: ok ? 1 : 0, total: 1 })
  const counted = (right, total, extraOk = true) => ({ correct: right === total && total > 0 && extraOk, right, total })
  const has = type === 'number' || type === 'hotspot' ? null : await tokenChecker(lock)

  switch (type) {
    case 'text':
      return whole(await has(normalizeText(input, lock.answer.options)))

    case 'number': {
      const a = lock.answer
      const n = parseNumber(input?.value)
      if (Number.isNaN(n)) return whole(false)
      let lo
      let hi
      if (isProtected(lock)) {
        lo = decodeNumber(lock.sealed.lo, lock.sealed.salt)
        hi = decodeNumber(lock.sealed.hi, lock.sealed.salt)
      } else {
        lo = a.value - toleranceOf(a)
        hi = a.value + toleranceOf(a)
      }
      const eps = 1e-9 * Math.max(1, Math.abs(lo), Math.abs(hi))
      if (n < lo - eps || n > hi + eps) return whole(false)
      // units
      const typed = unitKey(input?.unit)
      const needsUnit = isProtected(lock) ? lock.sealed.hasUnits : a.units.filter(Boolean).length > 0
      if (!needsUnit) return whole(true)
      if (typed === '') return whole(!a.requireUnit)
      if (isProtected(lock)) return whole(lock.sealed.unitHashes.includes(await hashToken(lock.sealed.salt, typed)))
      return whole(a.units.map(unitKey).includes(typed))
    }

    case 'choice':
      return whole(!!input && (await has(input)))

    case 'multiChoice':
      return whole(Array.isArray(input) && input.length > 0 && (await has([...input].sort().join(','))))

    case 'match': {
      const pairs = Array.isArray(input) ? input : []
      let right = 0
      for (const p of pairs) if (await has(matchToken(p.left, p.right))) right += 1
      const total = isProtected(lock) ? lock.sealed.hashes.length : lock.answer.pairs.length
      return counted(right, total, pairs.length === total)
    }

    case 'order': {
      const order = Array.isArray(input) ? input : []
      let right = 0
      for (let i = 0; i < order.length; i++) if (await has(`${i}:${order[i]}`)) right += 1
      const total = isProtected(lock) ? lock.sealed.hashes.length : lock.answer.items.length
      return counted(right, total, order.length === total)
    }

    case 'categorize': {
      const placed = input && typeof input === 'object' ? input : {}
      let right = 0
      for (const [itemId, categoryId] of Object.entries(placed)) if (categoryId && (await has(`${itemId}>${categoryId}`))) right += 1
      const total = isProtected(lock) ? lock.sealed.hashes.length : lock.answer.items.length
      return counted(right, total, Object.values(placed).filter(Boolean).length === total)
    }

    case 'hotspot': {
      const regions = regionsOf(lock)
      const points = Array.isArray(input) ? input : []
      if (lock.answer.mode !== 'all') return whole(points.length > 0 && regions.some((r) => points.some((p) => pointInRect(p, r))) && points.length === 1)
      // 'all': every region needs its own marker, and no spare markers
      const used = new Set()
      let right = 0
      for (const r of regions) {
        const i = points.findIndex((p, idx) => !used.has(idx) && pointInRect(p, r))
        if (i >= 0) {
          used.add(i)
          right += 1
        }
      }
      return counted(right, regions.length, points.length === regions.length)
    }

    case 'dial':
      return whole(Array.isArray(input) && (await has(input.join('|'))))

    case 'direction':
      return whole(Array.isArray(input) && input.length > 0 && (await has(input.join(','))))

    default:
      return whole(false)
  }
}

// Which "common wrong answer" message (if any) fits what the student typed? Only text and number locks use it.
export function pickWrongFeedback(lock, input) {
  const rules = (lock.wrongFeedback ?? []).filter((r) => r.match && r.message)
  if (rules.length === 0) return null
  if (lock.answerType === 'text') {
    const typed = normalizeText(input, lock.answer.options)
    return rules.find((r) => normalizeText(r.match, lock.answer.options) === typed)?.message ?? null
  }
  if (lock.answerType === 'number') {
    const n = parseNumber(input?.value)
    return rules.find((r) => !Number.isNaN(n) && parseNumber(r.match) === n)?.message ?? null
  }
  return null
}

// What gets written to the learning record for an attempt (short, readable).
export function summarizeInput(lock, input) {
  const options = (id) => {
    const all = lock.answer.options ?? lock.answer.items ?? []
    return all.find((o) => o.id === id)?.text || id
  }
  let text
  switch (lock.answerType) {
    case 'text':
      text = String(input ?? '')
      break
    case 'number':
      text = `${input?.value ?? ''}${input?.unit ? ` ${input.unit}` : ''}`
      break
    case 'choice':
      text = options(input)
      break
    case 'multiChoice':
      text = (input ?? []).map(options).join('、')
      break
    case 'order':
      text = (input ?? []).map(options).join(' → ')
      break
    case 'dial':
    case 'direction':
      text = (input ?? []).join(' ')
      break
    default:
      text = JSON.stringify(input ?? null)
  }
  return text.slice(0, 300)
}

// ---------------------------------------------------------------- protection (publish time)

const dedupe = (list) => [...new Set(list)]

// Returns a protected copy of the lock: hashed answers in `sealed`, explanation encrypted, clear answers removed.
export async function protectLock(lock) {
  if (isProtected(lock)) return lock
  const a = lock.answer
  const salt = randomSalt()
  const hashAll = (tokens) => Promise.all(dedupe(tokens).map((t) => hashToken(salt, t)))
  const sealed = { salt }
  let publicAnswer

  switch (lock.answerType) {
    case 'text':
      publicAnswer = { options: a.options }
      sealed.hashes = await hashAll(plainTokens(lock))
      break
    case 'number': {
      publicAnswer = { requireUnit: !!a.requireUnit }
      const tol = toleranceOf(a)
      sealed.lo = encodeNumber(a.value - tol, salt)
      sealed.hi = encodeNumber(a.value + tol, salt)
      const units = a.units.filter(Boolean)
      sealed.hasUnits = units.length > 0
      sealed.unitHashes = await Promise.all(units.map((u) => hashToken(salt, unitKey(u))))
      break
    }
    case 'choice':
    case 'multiChoice':
      publicAnswer = { options: a.options }
      sealed.hashes = await hashAll(plainTokens(lock))
      break
    case 'match':
      // the correct partner of each left card is no longer readable from the data's order
      publicAnswer = { lefts: a.pairs.map((p) => ({ id: leftId(p), ...p.left })), rights: [...a.pairs].map((p) => ({ id: rightId(p), ...p.right })).sort((x, y) => x.id.localeCompare(y.id)) }
      sealed.hashes = await hashAll(plainTokens(lock))
      break
    case 'order':
      publicAnswer = { items: [...a.items].sort((x, y) => x.id.localeCompare(y.id)) }
      sealed.hashes = await hashAll(plainTokens(lock))
      break
    case 'categorize':
      publicAnswer = { categories: a.categories, items: a.items.map(({ categoryId: _drop, ...rest }) => rest) }
      sealed.hashes = await hashAll(plainTokens(lock))
      break
    case 'hotspot':
      publicAnswer = { assetId: a.assetId, mode: a.mode, regionCount: a.regions.length }
      sealed.regions = a.regions.map((r) => [r.x, r.y, r.w, r.h].map((n) => encodeNumber(n, salt)))
      break
    case 'dial':
      publicAnswer = { cells: a.cells, charset: a.charset, custom: a.custom }
      sealed.hashes = await hashAll(plainTokens(lock))
      break
    case 'direction':
      publicAnswer = {}
      sealed.hashes = await hashAll(plainTokens(lock))
      break
    default:
      publicAnswer = {}
  }

  const { answerDrafts: _drafts, ...rest } = lock // old answers of other types the teacher switched away from
  const protectedLock = { ...rest, answer: publicAnswer, sealed, explanation: '' }
  if (lock.explanation) protectedLock.explanationSealed = await sealText(lock.explanation, salt)
  return protectedLock
}

// A copy of the whole mission with every lock protected. The draft itself is never touched.
export async function protectMission(data) {
  const copy = structuredClone(data)
  for (const stage of copy.stages) {
    for (const scene of stage.scenes) {
      scene.objects = await Promise.all(scene.objects.map((o) => (o.type === 'lock' ? protectLock(o) : o)))
    }
  }
  return copy
}

// ---------------------------------------------------------------- health check

const filled = (s) => !!String(s ?? '').trim()
const hasContent = (o) => filled(o.text) || !!o.assetId

// Problems with one lock, in teacher words: { errors: [], warnings: [] } (errors block publishing).
export function validateLock(lock) {
  const errors = []
  const warnings = []
  const a = lock.answer ?? {}
  const err = (t) => errors.push(t)

  if (!filled(String(lock.prompt ?? '').replace(/<[^>]*>/g, ''))) warnings.push('題目還是空的，學生不知道要回答什麼。')

  switch (lock.answerType) {
    case 'text':
      if (!(a.accepted ?? []).some(filled)) err('還沒有填正確答案。')
      break
    case 'number':
      if (!Number.isFinite(a.value)) err('還沒有填正確的數值。')
      if (a.requireUnit && !(a.units ?? []).some(filled)) err('勾了「一定要寫單位」，但還沒有填可接受的單位。')
      break
    case 'choice':
      if ((a.options ?? []).filter(hasContent).length < 2) err('單選題至少要有 2 個選項。')
      else if (!a.correct || !(a.options ?? []).some((o) => o.id === a.correct && hasContent(o))) err('還沒有指定哪一個選項是正確答案。')
      break
    case 'multiChoice':
      if ((a.options ?? []).filter(hasContent).length < 2) err('複選題至少要有 2 個選項。')
      else if (!(a.correct ?? []).some((id) => (a.options ?? []).some((o) => o.id === id && hasContent(o)))) err('還沒有勾選正確的選項。')
      break
    case 'match':
      if ((a.pairs ?? []).filter((p) => hasContent(p.left) && hasContent(p.right)).length < 2) err('配對題至少要有 2 組、而且兩邊都要填。')
      else if ((a.pairs ?? []).some((p) => hasContent(p.left) !== hasContent(p.right))) err('有一組配對只填了一邊。')
      break
    case 'order':
      if ((a.items ?? []).filter(hasContent).length < 2) err('排順序至少要有 2 個項目。')
      else if ((a.items ?? []).some((o) => !hasContent(o))) err('有一個排序項目是空的。')
      break
    case 'categorize':
      if ((a.categories ?? []).filter((c) => filled(c.name)).length < 2) err('分類題至少要有 2 個分類，而且要有名稱。')
      else if ((a.items ?? []).length < 2) err('分類題至少要有 2 張卡片。')
      else if ((a.items ?? []).some((it) => !hasContent(it) || !it.categoryId)) err('有卡片是空的，或還沒指定它屬於哪一類。')
      break
    case 'hotspot':
      if (!a.assetId) err('還沒有選圖片。')
      else if ((a.regions ?? []).length === 0) err('還沒有在圖片上畫出正確的區域。')
      break
    case 'dial': {
      const chars = dialChars(a)
      if (chars.length < 2) err('轉盤可以選的字元太少（至少 2 個）。')
      else if ((a.value ?? []).length !== a.cells || (a.value ?? []).some((v) => !chars.includes(v))) err('轉盤的正確密碼有格子不在可選字元裡。')
      break
    }
    case 'direction':
      if ((a.sequence ?? []).length === 0) err('還沒有設定正確的方向順序。')
      break
    default:
      err('不認識的答案類型。')
  }

  if ((lock.hints ?? []).filter(filled).length === 0) warnings.push('沒有任何提示，學生卡關時沒有幫助。')
  if (lock.giveUp?.enabled && !filled(String(lock.explanation ?? '').replace(/<[^>]*>/g, ''))) warnings.push('開了「我真的不會」，但還沒寫解析（學生按了會看到空白）。')
  if ((lock.onSuccess ?? []).length === 0) warnings.push('解開之後沒有任何事會發生（學生答對了卻沒有後續）。')
  return { errors, warnings }
}

// What the student's screen needs from a lock, in the same shape for clear and protected locks.
export function lockView(lock) {
  const a = lock.answer
  switch (lock.answerType) {
    case 'match':
      return a.pairs
        ? { lefts: a.pairs.map((p) => ({ id: leftId(p), ...p.left })), rights: a.pairs.map((p) => ({ id: rightId(p), ...p.right })) }
        : { lefts: a.lefts, rights: a.rights }
    case 'hotspot':
      return { assetId: a.assetId, mode: a.mode, regionCount: a.regions ? a.regions.length : a.regionCount }
    case 'number':
      return { requireUnit: !!a.requireUnit, askUnit: isProtected(lock) ? lock.sealed.hasUnits : (a.units ?? []).some(filled) }
    default:
      return a
  }
}
