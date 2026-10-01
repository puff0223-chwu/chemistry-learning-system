// Unified event actions and conditions (spec-v5 §7). Shared by the editor (forms) and the player (executor).
//
// Teacher-facing vocabulary: the data still says "flag", but the editor calls it a「進度記號」: a note about
// something the student has done ("拿到鑰匙"). Conditions read like sentences ("學生已經 拿到鑰匙").

// What the editor offers when adding an action. `category` picks the colour stripe in the editor.
// The engine also understands add_item / remove_item / add_notebook / complete_objective; those get editor
// forms in the phases that introduce items, notebook and objectives.
export const ACTION_META = [
  { type: 'show_message', icon: '💬', label: '說話', desc: '顯示一段話給學生看', category: 'talk' },
  { type: 'goto_scene', icon: '🚶', label: '去別的場景', desc: '帶學生走到另一個場景', category: 'move' },
  { type: 'reveal_object', icon: '✨', label: '讓東西出現', desc: '讓一個隱藏的物件現身', category: 'object' },
  { type: 'hide_object', icon: '🙈', label: '讓東西消失', desc: '讓一個物件從畫面上不見', category: 'object' },
  { type: 'swap_background', icon: '🖼️', label: '換背景', desc: '把某個場景的背景換成別張圖', category: 'object' },
  { type: 'set_flag', icon: '📌', label: '記住一件事', desc: '記下「學生做過這件事」（進度記號）', category: 'memory' },
  { type: 'clear_flag', icon: '🧽', label: '忘記一件事', desc: '把某個進度記號擦掉', category: 'memory' },
  { type: 'if', icon: '🔀', label: '如果…就…', desc: '依情況做不同的事', category: 'flow' },
  { type: 'play_sound', icon: '🔊', label: '播放音效', desc: '播放素材庫裡的音訊', category: 'flow' },
  { type: 'open_lock', icon: '🔐', label: '出一道題目', desc: '讓學生回答某個答案鎖（題目）', category: 'lock' },
  { type: 'delay', icon: '⏱️', label: '等一下', desc: '停幾秒再做下一件事', category: 'flow' },
  { type: 'complete_objective', icon: '🎯', label: '完成任務目標', desc: '讓某個任務目標變成「已完成」', category: 'goal' },
  { type: 'complete_stage', icon: '🏁', label: '讓學生過關', desc: '學生完成這一關', category: 'goal' },
]
export const ACTION_TYPES = ACTION_META.map(({ type, label }) => ({ type, label }))
export const actionMeta = (type) => ACTION_META.find((m) => m.type === type)

// Actions the engine cannot run yet (their blocks arrive later); they are skipped with a console note.
export const DEFERRED_ACTIONS = ['set_state', 'open_workbench']

export const TRANSITIONS = [
  { value: '', label: '淡入（預設）' },
  { value: 'left', label: '從左滑入' },
  { value: 'right', label: '從右滑入' },
  { value: 'up', label: '從上滑入' },
  { value: 'down', label: '從下滑入' },
  { value: 'forward', label: '往前（放大淡入）' },
  { value: 'backward', label: '往後（縮小淡入）' },
]

export function newAction(type) {
  switch (type) {
    case 'show_message':
      return { action: type, message: '' }
    case 'goto_scene':
      return { action: type, sceneId: null, transition: '' }
    case 'reveal_object':
    case 'hide_object':
      return { action: type, target: null }
    case 'set_flag':
    case 'clear_flag':
      return { action: type, flag: '' }
    case 'swap_background':
      return { action: type, sceneId: null, assetId: null }
    case 'play_sound':
      return { action: type, assetId: null }
    case 'open_lock':
      return { action: type, target: null }
    case 'complete_objective':
      return { action: type, objectiveId: null }
    case 'delay':
      return { action: type, ms: 1000 }
    case 'if':
      return { if: {}, then: [], else: [] }
    default:
      return { action: type }
  }
}

// A branch is written { if, then, else } with no `action` key (spec §7.2).
export const isBranch = (a) => a && typeof a === 'object' && 'if' in a
export const actionTypeOf = (a) => (isBranch(a) ? 'if' : a.action)

const FLAG_KEYS = ['allFlags', 'anyFlags', 'notFlags']
// Empty names are placeholders the editor keeps while a teacher is still choosing; the game ignores them.
const names = (list) => (list ?? []).filter(Boolean)

export function isEmptyCondition(c) {
  if (!c) return true
  return (
    FLAG_KEYS.every((k) => names(c[k]).length === 0) &&
    !(c.hasItems?.length > 0) &&
    names(c.objectivesDone).length === 0 &&
    !(c.notebookCountAtLeast > 0) &&
    !(c.elapsedSecondsAtLeast > 0)
  )
}

// `view` = { flags: {name: true}, items: [], objectivesDone: [], notebookCount: n, elapsedSeconds: n }.
// Every field that is filled in must hold; an empty condition always holds.
export function evalCondition(c, view) {
  if (isEmptyCondition(c)) return true
  const has = (flag) => view.flags[flag] === true
  const all = names(c.allFlags)
  const any = names(c.anyFlags)
  const none = names(c.notFlags)
  if (all.length && !all.every(has)) return false
  if (any.length && !any.some(has)) return false
  if (none.length && none.some(has)) return false
  if (c.hasItems?.length && !c.hasItems.every((id) => view.items.includes(id))) return false
  const goals = names(c.objectivesDone)
  if (goals.length && !goals.every((id) => view.objectivesDone.includes(id))) return false
  if (c.notebookCountAtLeast > 0 && view.notebookCount < c.notebookCountAtLeast) return false
  if (c.elapsedSecondsAtLeast > 0 && view.elapsedSeconds < c.elapsedSecondsAtLeast) return false
  return true
}

// ---- walking a mission's events ---------------------------------------------------------------

// Calls fn(action) for every action in the list, including those inside if/then/else.
export function walkActions(actions, fn) {
  for (const a of actions ?? []) {
    if (isBranch(a)) {
      walkActions(a.then, fn)
      walkActions(a.else, fn)
    } else fn(a)
  }
}

function branchConditions(list, into = []) {
  for (const a of list ?? []) {
    if (isBranch(a)) {
      into.push(a.if)
      branchConditions(a.then, into)
      branchConditions(a.else, into)
    }
  }
  return into
}

// Every place in the mission that holds an event list or a condition, each with a teacher-readable label:
// [{ label, actions: [...], conditions: [...] }]. One traversal shared by the health check, the
// progress-marker manager and the stage dialog, so they can never disagree about where events live.
export function listSources(data) {
  const out = []
  const multi = data.stages.length > 1
  let current = null
  const pre = () => (multi ? `關卡「${current.title}」・` : '')
  const addActions = (label, list) => {
    if (list?.length) out.push({ label: pre() + label, stageId: current?.stageId, actions: list, conditions: branchConditions(list) })
  }
  const addCondition = (label, cond) => {
    if (cond) out.push({ label: pre() + label, stageId: current?.stageId, actions: [], conditions: [cond] })
  }
  for (const link of data.stageLinks ?? []) {
    const name = (id) => data.stages.find((s) => s.stageId === id)?.title ?? '？'
    if (link.when) out.push({ label: `關卡連線「${name(link.from)} → ${name(link.to)}」的條件`, stageId: link.from, actions: [], conditions: [link.when] })
  }
  for (const stage of data.stages) {
  current = stage
  addCondition('關卡的「自動過關條件」', stage.completeWhen)
  addActions('關卡「過關後」', stage.onComplete)
  for (const obj of stage.objectives ?? []) {
    addCondition(`目標「${obj.text}」的出現條件`, obj.visibleWhen)
    addCondition(`目標「${obj.text}」的完成條件`, obj.doneWhen)
    addActions(`目標「${obj.text}」完成時`, obj.onDone)
  }
  for (const scene of stage.scenes) {
    addActions(`場景「${scene.name}」進入時`, scene.onEnter)
    for (const [dir, rule] of Object.entries(scene.exitConditions ?? {})) addCondition(`場景「${scene.name}」的出口條件（${dir}）`, rule?.when)
    for (const o of scene.objects) {
      addActions(`場景「${scene.name}」的「${o.name}」被點擊時`, o.onClick)
      addCondition(`場景「${scene.name}」的「${o.name}」的出現條件`, o.showWhen)
      if (o.type === 'lock') {
        addActions(`場景「${scene.name}」的答案鎖「${o.name}」答對時`, o.onSuccess)
        addActions(`場景「${scene.name}」的答案鎖「${o.name}」按「我真的不會」時`, o.onGiveUp)
      }
    }
  }
  }
  return out
}

export function collectEventSources(data) {
  const sources = listSources(data)
  return { actionLists: sources.filter((s) => s.actions.length).map((s) => s.actions), conditions: sources.flatMap((s) => s.conditions) }
}

// Progress markers set or used anywhere (for the editor's pick lists).
export function collectFlags(data) {
  return [...flagUsage(data).keys()].sort()
}

// name -> { sets: [label], uses: [label] }: where each marker is remembered and where it is checked.
export function flagUsage(data) {
  const usage = new Map()
  const entry = (name) => {
    if (!usage.has(name)) usage.set(name, { sets: [], uses: [] })
    return usage.get(name)
  }
  for (const source of listSources(data)) {
    walkActions(source.actions, (a) => {
      if (a.action === 'set_flag' && a.flag) entry(a.flag).sets.push(source.label)
      if (a.action === 'clear_flag' && a.flag) entry(a.flag).uses.push(`${source.label}（忘記）`)
    })
    for (const c of source.conditions) for (const k of FLAG_KEYS) for (const f of names(c?.[k])) entry(f).uses.push(source.label)
  }
  return usage
}

// Renames a marker everywhere (events and conditions). Returns a new mission data object.
export function renameFlag(data, from, to) {
  const copy = structuredClone(data)
  const walk = (node) => {
    if (Array.isArray(node)) node.forEach(walk)
    else if (node && typeof node === 'object') {
      if ((node.action === 'set_flag' || node.action === 'clear_flag') && node.flag === from) node.flag = to
      for (const k of FLAG_KEYS) if (Array.isArray(node[k])) node[k] = node[k].map((f) => (f === from ? to : f))
      Object.values(node).forEach(walk)
    }
  }
  walk(copy.stages)
  return copy
}

// Places where a stage can currently be completed by an event ("完成本關"). `stageId` limits it to one stage.
export function completionSources(data, stageId = null) {
  const found = []
  for (const source of listSources(data)) {
    if (stageId && source.stageId !== stageId) continue
    let has = false
    walkActions(source.actions, (a) => {
      if (a.action === 'complete_stage') has = true
    })
    if (has) found.push(source.label)
  }
  return found
}

export function usesElapsedTime(data) {
  return listSources(data).some((s) => s.conditions.some((c) => c?.elapsedSecondsAtLeast > 0))
}

// ---- plain-language descriptions ------------------------------------------------------------------

const quote = (t) => `「${t}」`
const clip = (t, n = 14) => (t.length > n ? `${t.slice(0, n)}…` : t)

// "學生已經 拿到鑰匙，而且 還沒 打開門" — shown under every condition so the teacher can check their own meaning.
export function describeCondition(c, ctx = null) {
  if (isEmptyCondition(c)) return '沒有任何限制'
  const parts = []
  const all = names(c.allFlags)
  const any = names(c.anyFlags)
  const none = names(c.notFlags)
  if (all.length) parts.push(`已經${all.map(quote).join('、')}`)
  if (none.length) parts.push(`還沒${none.map(quote).join('、')}`)
  if (any.length) parts.push(`${any.map(quote).join('、')}其中一件已經發生`)
  if (names(c.objectivesDone).length) parts.push(`已完成目標${names(c.objectivesDone).map((id) => quote(ctx?.objectives?.find((o) => o.id === id)?.text ?? '？')).join('、')}`)
  if (c.elapsedSecondsAtLeast > 0) parts.push(`遊戲開始超過 ${c.elapsedSecondsAtLeast} 秒`)
  return `學生${parts.join('，而且')}`
}

// One short phrase per action, for summaries ("說「…」→ 記住「拿到鑰匙」→ 讓「鑰匙」消失").
export function describeAction(a, ctx) {
  const scene = (id) => ctx.scenes.find((s) => s.sceneId === id)?.name ?? '？'
  const object = (id) => ctx.objects.find((o) => o.id === id)?.name ?? '？'
  if (isBranch(a)) return '如果…就…'
  switch (a.action) {
    case 'show_message':
      return `說${quote(clip(a.message || '…'))}`
    case 'goto_scene':
      return `去${quote(scene(a.sceneId))}`
    case 'reveal_object':
      return `讓${quote(object(a.target))}出現`
    case 'hide_object':
      return `讓${quote(object(a.target))}消失`
    case 'set_flag':
      return `記住${quote(a.flag || '？')}`
    case 'clear_flag':
      return `忘記${quote(a.flag || '？')}`
    case 'swap_background':
      return `換${quote(scene(a.sceneId))}的背景`
    case 'play_sound':
      return '播放音效'
    case 'open_lock':
      return `出題「${object(a.target)}」`
    case 'complete_objective':
      return `完成目標${quote(ctx.objectives?.find((o) => o.id === a.objectiveId)?.text ?? '？')}`
    case 'delay':
      return `等 ${(a.ms ?? 0) / 1000} 秒`
    case 'complete_stage':
      return '讓學生過關'
    default:
      return a.action
  }
}
