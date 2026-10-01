// Unified event actions and conditions (spec-v5 §7). Shared by the editor (forms) and the player (executor).

// Actions the editor offers today. The engine also understands add_item / remove_item / add_notebook /
// complete_objective; those get editor forms in the phases that introduce items, notebook and objectives.
export const ACTION_TYPES = [
  { type: 'show_message', label: '顯示訊息' },
  { type: 'goto_scene', label: '前往場景' },
  { type: 'reveal_object', label: '顯示物件' },
  { type: 'hide_object', label: '隱藏物件' },
  { type: 'set_flag', label: '設定旗標（記住某件事發生了）' },
  { type: 'clear_flag', label: '清除旗標' },
  { type: 'swap_background', label: '更換場景背景' },
  { type: 'play_sound', label: '播放音效' },
  { type: 'delay', label: '等待一下' },
  { type: 'complete_stage', label: '完成本關（過關）' },
  { type: 'if', label: '如果…就…否則…（條件分支）' },
]

// Actions the engine cannot run yet (their blocks arrive later); they are skipped with a console note.
export const DEFERRED_ACTIONS = ['set_state', 'open_lock', 'open_workbench']

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

export function isEmptyCondition(c) {
  if (!c) return true
  return (
    FLAG_KEYS.every((k) => !(c[k]?.length > 0)) &&
    !(c.hasItems?.length > 0) &&
    !(c.objectivesDone?.length > 0) &&
    !(c.notebookCountAtLeast > 0) &&
    !(c.elapsedSecondsAtLeast > 0)
  )
}

// `view` = { flags: {name: true}, items: [], objectivesDone: [], notebookCount: n, elapsedSeconds: n }.
// Every field that is filled in must hold; an empty condition always holds.
export function evalCondition(c, view) {
  if (isEmptyCondition(c)) return true
  const has = (flag) => view.flags[flag] === true
  if (c.allFlags?.length && !c.allFlags.every(has)) return false
  if (c.anyFlags?.length && !c.anyFlags.some(has)) return false
  if (c.notFlags?.length && c.notFlags.some(has)) return false
  if (c.hasItems?.length && !c.hasItems.every((id) => view.items.includes(id))) return false
  if (c.objectivesDone?.length && !c.objectivesDone.every((id) => view.objectivesDone.includes(id))) return false
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

// Every place in the mission that holds an event list or a condition.
// Returns { actionLists: [list], conditions: [cond] } so checkers do not each re-implement the traversal.
export function collectEventSources(data) {
  const actionLists = []
  const conditions = []
  const addList = (list) => {
    if (!list?.length) return
    actionLists.push(list)
    const scan = (items) => {
      for (const a of items) {
        if (isBranch(a)) {
          conditions.push(a.if)
          scan(a.then ?? [])
          scan(a.else ?? [])
        }
      }
    }
    scan(list)
  }
  for (const stage of data.stages) {
    addList(stage.onComplete)
    if (stage.completeWhen) conditions.push(stage.completeWhen)
    for (const scene of stage.scenes) {
      addList(scene.onEnter)
      for (const ex of Object.values(scene.exitConditions ?? {})) if (ex?.when) conditions.push(ex.when)
      for (const o of scene.objects) {
        addList(o.onClick)
        if (o.showWhen) conditions.push(o.showWhen)
      }
    }
  }
  return { actionLists, conditions }
}

// Flags set or used anywhere (for the editor's suggestion list and the preview panel).
export function collectFlags(data) {
  const flags = new Set()
  const { actionLists, conditions } = collectEventSources(data)
  for (const list of actionLists) {
    walkActions(list, (a) => {
      if ((a.action === 'set_flag' || a.action === 'clear_flag') && a.flag) flags.add(a.flag)
    })
  }
  for (const c of conditions) for (const k of FLAG_KEYS) for (const f of c?.[k] ?? []) if (f) flags.add(f)
  return [...flags].sort()
}

export function usesElapsedTime(data) {
  return collectEventSources(data).conditions.some((c) => c?.elapsedSecondsAtLeast > 0)
}
