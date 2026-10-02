import { validateLock } from './lockLogic.js'
import { FACT_KEYS, collectEventSources, completionSources, isEmptyCondition, listSources, usesGoalCompletion, walkActions } from './missionEvents.js'

// Pre-publish health check (spec-v5 §17.5), for missions of one or several stages.
// `existingAssetIds` = ids that still exist in the asset library.
// Returns { errors: [text], warnings: [text] }. Errors block publishing, warnings can be confirmed.
export function checkMission(data, existingAssetIds) {
  const errors = []
  const warnings = []
  // Parallel to errors / warnings: where to jump to fix each one ({ stageId, sceneId, objectId, dialog, view }).
  const errorWhere = []
  const warningWhere = []
  const err = (text, place = {}) => (errors.push(text), errorWhere.push(place))
  const warn = (text, place = {}) => (warnings.push(text), warningWhere.push(place))
  const stages = data.stages
  const multi = stages.length > 1
  const links = data.stageLinks ?? []
  const stageIdOfScene = new Map(stages.flatMap((st) => st.scenes.map((sc) => [sc.sceneId, st.stageId])))
  const sceneById = new Map(stages.flatMap((st) => st.scenes.map((sc) => [sc.sceneId, sc])))
  const objectById = new Map(stages.flatMap((st) => st.scenes.flatMap((s) => s.objects.map((o) => [o.id, { object: o, scene: s }]))))
  const lockById = new Map(stages.flatMap((st) => st.scenes.flatMap((s) => s.objects.filter((o) => o.type === 'lock').map((o) => [o.id, o]))))
  // a group can be the target of "show / hide"
  const groupIds = new Set(stages.flatMap((st) => st.scenes.flatMap((s) => (s.groups ?? []).map((g) => g.id))))
  const itemIds = new Set((data.items ?? []).map((i) => i.itemId))
  const deviceById = new Map([...objectById].filter(([, { object }]) => object.type === 'device').map(([id, { object }]) => [id, object]))
  const obtainable = new Set() // items the student can get: picked up, given by an event, or made by a combination
  const objectiveIds = new Set(stages.flatMap((st) => (st.objectives ?? []).map((o) => o.objectiveId)))
  const where = (st) => (multi ? `關卡「${st.title}」：` : '')

  // ---- stages: scenes, start scene, how to finish, and whether anybody can ever get in
  for (const st of stages) {
    const here = { stageId: st.stageId }
    if (st.scenes.length === 0) err(`${where(st)}沒有任何場景。`, here)
    if (!st.startSceneId || !st.scenes.some((s) => s.sceneId === st.startSceneId)) err(`${where(st)}還沒有設定起始場景。`, here)
    if (st.completeWhen && isEmptyCondition(st.completeWhen)) warn(`${where(st)}「自動過關」已勾選，但還沒設定要完成哪些事（所以不會自動過關）。`, { ...here, dialog: 'flow' })
    const canComplete = !isEmptyCondition(st.completeWhen) || completionSources(data, st.stageId).length > 0 || usesGoalCompletion(data, st)
    if (!canComplete) warn(`${where(st)}沒有設定過關條件，也沒有任何「完成本關」動作，學生無法過關。`, { ...here, dialog: 'flow' })
  }
  if (multi) {
    const starters = stages.filter((st) => !links.some((l) => l.to === st.stageId))
    if (starters.length === 0) err('每一關都有別的關卡連到它，沒有一關是一開始就能玩的（連線繞成圈了）。', { view: 'stages' })
    // which stages can ever open? (ignoring conditions: a branch may still never be taken, that is up to the teacher)
    const open = new Set(starters.map((st) => st.stageId))
    for (let round = 0; round < stages.length; round++) {
      for (const st of stages) {
        if (open.has(st.stageId)) continue
        const incoming = links.filter((l) => l.to === st.stageId)
        const ok = (st.join ?? 'all') === 'any' ? incoming.some((l) => open.has(l.from)) : incoming.every((l) => open.has(l.from))
        if (ok) open.add(st.stageId)
      }
    }
    for (const st of stages) if (!open.has(st.stageId)) warn(`${where(st)}永遠不會開放（連到它的關卡本身就打不開）。`, { view: 'stages' })
  }

  // ---- every event list in the mission, with a label that names the culprit
  const lists = listSources(data).filter((s) => s.actions.length)
  const flagsSet = new Set()
  const gotoTargets = new Map() // stageId -> Set of scene ids that some event walks to
  const completedByEvent = new Set() // objective ids that some event completes
  for (const { label, stageId, actions, where: place } of lists) {
    walkActions(actions, (a) => {
      switch (a.action) {
        case 'goto_scene':
          if (!a.sceneId) err(`${label}：「前往場景」還沒選場景。`, place)
          else if (!sceneById.has(a.sceneId)) err(`${label}：「前往場景」指向不存在的場景。`, place)
          else if (stageIdOfScene.get(a.sceneId) !== stageId) err(`${label}：「前往場景」要去的場景在另一關，不能直接跳過去（跨關卡請用關卡連線）。`, place)
          else gotoTargets.set(stageId, (gotoTargets.get(stageId) ?? new Set()).add(a.sceneId))
          break
        case 'reveal_object':
        case 'hide_object':
          if (!a.target) err(`${label}：「${a.action === 'reveal_object' ? '顯示' : '隱藏'}物件」還沒選物件。`, place)
          else if (!objectById.has(a.target) && !groupIds.has(a.target)) err(`${label}：「${a.action === 'reveal_object' ? '顯示' : '隱藏'}物件」指向不存在（或已刪除）的物件。`, place)
          break
        case 'open_lock':
          if (!a.target) err(`${label}：「出一道題目」還沒選是哪一題。`, place)
          else if (!lockById.has(a.target)) err(`${label}：「出一道題目」指向不存在（或已刪除）的答案鎖。`, place)
          break
        case 'add_item':
        case 'remove_item': {
          const verb = a.action === 'add_item' ? '放進證物袋' : '從證物袋拿走'
          if (!a.itemId) err(`${label}：「${verb}」還沒選物品。`, place)
          else if (!itemIds.has(a.itemId)) err(`${label}：「${verb}」指向不存在（或已刪除）的物品。`, place)
          else if (a.action === 'add_item') obtainable.add(a.itemId)
          break
        }
        case 'set_state': {
          const device = deviceById.get(a.target)
          if (!a.target) err(`${label}：「改變裝置狀態」還沒選裝置。`, place)
          else if (!device) err(`${label}：「改變裝置狀態」指向不存在（或已刪除）的裝置。`, place)
          else if (!a.state) err(`${label}：「改變裝置狀態」還沒選要變成哪個狀態。`, place)
          else if (!device.states.some((s) => s.id === a.state)) err(`${label}：「改變裝置狀態」指向裝置上不存在的狀態。`, place)
          break
        }
        case 'complete_objective':
          if (!a.objectiveId) err(`${label}：「完成任務目標」還沒選是哪一個目標。`, place)
          else if (!objectiveIds.has(a.objectiveId)) err(`${label}：「完成任務目標」指向不存在（或已刪除）的目標。`, place)
          else completedByEvent.add(a.objectiveId)
          break
        case 'set_flag':
          if (!a.flag) err(`${label}：「設定旗標」沒有填旗標名稱。`, place)
          else flagsSet.add(a.flag)
          break
        case 'clear_flag':
          if (!a.flag) err(`${label}：「清除旗標」沒有填旗標名稱。`, place)
          break
        case 'swap_background':
          if (!a.sceneId || !sceneById.has(a.sceneId)) err(`${label}：「更換場景背景」的場景不存在或沒選。`, place)
          if (!a.assetId) err(`${label}：「更換場景背景」還沒選圖片。`, place)
          break
        case 'play_sound':
          if (!a.assetId) err(`${label}：「播放音效」還沒選音效。`, place)
          break
        case 'show_message':
          if (!a.message?.trim()) warn(`${label}：有一則「顯示訊息」是空的。`, place)
          break
        default:
      }
    })
  }

  // ---- objectives
  for (const st of stages) {
    for (const o of st.objectives ?? []) {
      if (!o.text?.trim()) warn(`${where(st)}有一個任務目標還沒寫內容。`, { stageId: st.stageId, dialog: 'goals' })
      if (isEmptyCondition(o.doneWhen) && !completedByEvent.has(o.objectiveId)) {
        warn(`${where(st)}任務目標「${o.text || '（未命名）'}」沒有完成方式（不會自動完成，也沒有任何事件會完成它）。`, { stageId: st.stageId, dialog: 'goals' })
      }
    }
  }
  for (const source of listSources(data)) {
    for (const c of source.conditions) {
      if ((c?.objectivesDone ?? []).some((id) => id && !objectiveIds.has(id))) err(`${source.label}：條件用到已經刪除的任務目標，請重新選擇。`, source.where)
      const gone = (keys, has) => keys.some((k) => (c?.[k] ?? []).some((id) => id && !has(id)))
      if (gone(['visitedScenes', 'notVisitedScenes'], (id) => sceneById.has(id))) err(`${source.label}：條件用到已經刪除的地點（場景），請重新選擇。`, source.where)
      if (gone(['clickedObjects', 'notClickedObjects'], (id) => objectById.has(id))) err(`${source.label}：條件用到已經刪除的物件，請重新選擇。`, source.where)
      if (gone(['solvedLocks', 'notSolvedLocks'], (id) => lockById.has(id))) err(`${source.label}：條件用到已經刪除的題目，請重新選擇。`, source.where)
      if (gone(['hasItems', 'notHasItems'], (id) => itemIds.has(id))) err(`${source.label}：條件用到已經刪除的物品，請重新選擇。`, source.where)
      for (const d of Array.isArray(c?.deviceStates) ? c.deviceStates : []) {
        if (!d?.target) continue
        const device = deviceById.get(d.target)
        if (!device || (d.state && !device.states.some((s) => s.id === d.state))) err(`${source.label}：條件用到已經刪除的裝置或裝置狀態，請重新選擇。`, source.where)
      }
      const blank = ['allFlags', 'anyFlags', 'notFlags', 'objectivesDone', ...FACT_KEYS].some((k) => (c?.[k] ?? []).some((f) => !f))
      if (blank) warn(`${source.label}：有一個條件還沒選是哪一項，目前會被忽略。`, source.where)
    }
  }

  // ---- scenes and objects
  for (const st of stages) {
    for (const scene of st.scenes) {
      for (const o of scene.objects) {
        if (o.type !== 'lock') continue
        const result = validateLock(o)
        for (const t of result.errors) err(`${where(st)}場景「${scene.name}」的答案鎖「${o.name}」：${t}`, { stageId: st.stageId, sceneId: scene.sceneId, objectId: o.id })
        for (const t of result.warnings) warn(`${where(st)}場景「${scene.name}」的答案鎖「${o.name}」：${t}`, { stageId: st.stageId, sceneId: scene.sceneId, objectId: o.id })
      }
      for (const [dir, target] of Object.entries(scene.exits)) {
        if (target && !sceneById.has(target)) err(`${where(st)}場景「${scene.name}」的「${dir}」出口指向不存在的場景。`, { stageId: st.stageId, sceneId: scene.sceneId })
        else if (target && stageIdOfScene.get(target) !== st.stageId) err(`${where(st)}場景「${scene.name}」的「${dir}」出口通往另一關的場景，不能這樣連（跨關卡請用關卡連線）。`, { stageId: st.stageId, sceneId: scene.sceneId })
      }
      if (scene.background?.type === 'image' && !scene.background.assetId) err(`${where(st)}場景「${scene.name}」的背景圖還沒選。`, { stageId: st.stageId, sceneId: scene.sceneId })
      if (scene.background?.assetId && !existingAssetIds.has(scene.background.assetId)) err(`${where(st)}場景「${scene.name}」的背景圖已經從素材庫刪除，請重新選擇。`, { stageId: st.stageId, sceneId: scene.sceneId })
      for (const o of scene.objects) {
        const here = { stageId: st.stageId, sceneId: scene.sceneId, objectId: o.id }
        if (o.collectible) {
          if (!o.itemId) err(`${where(st)}場景「${scene.name}」的「${o.name}」設成可以撿起，但還沒選是哪一個物品。`, here)
          else if (!itemIds.has(o.itemId)) err(`${where(st)}場景「${scene.name}」的「${o.name}」撿起的物品已經從物品清單刪除，請重新選擇。`, here)
          else obtainable.add(o.itemId)
        }
        if (o.type === 'socket') {
          const accepts = (o.accepts ?? []).filter(Boolean)
          if (accepts.length === 0) err(`${where(st)}場景「${scene.name}」的插座「${o.name}」還沒設定要放哪個物品。`, here)
          else if (accepts.some((id) => !itemIds.has(id))) err(`${where(st)}場景「${scene.name}」的插座「${o.name}」接受的物品已經從物品清單刪除，請重新選擇。`, here)
          if ((o.onMatch ?? []).length === 0) warn(`${where(st)}場景「${scene.name}」的插座「${o.name}」放對物品後什麼事都不會發生。`, here)
        }
        if (o.type === 'device' && (o.states ?? []).length < 2) err(`${where(st)}場景「${scene.name}」的裝置「${o.name}」至少要有 2 個狀態。`, here)
      }
      for (const o of scene.objects) {
        if ((o.type === 'image' || (o.type === 'video' && !o.youtubeUrl)) && !o.assetId) {
          warn(`${where(st)}場景「${scene.name}」的「${o.name}」還沒選素材（學生會看到佔位圖）。`, { stageId: st.stageId, sceneId: scene.sceneId, objectId: o.id })
        }
        if (o.assetId && !existingAssetIds.has(o.assetId)) err(`${where(st)}場景「${scene.name}」的「${o.name}」用到的素材已經從素材庫刪除，請重新選擇。`, { stageId: st.stageId, sceneId: scene.sceneId, objectId: o.id })
      }
    }
  }

  // ---- items: combinations, and items nobody can ever get
  for (const c of data.combinations ?? []) {
    if (!itemIds.has(c.a) || !itemIds.has(c.b) || !itemIds.has(c.result)) err('有一個物品組合用到已經刪除（或還沒選）的物品。', { dialog: 'items' })
    else {
      if (c.a === c.b) err('有一個物品組合的兩邊是同一個物品。', { dialog: 'items' })
      obtainable.add(c.result)
    }
  }
  for (const item of data.items ?? []) {
    if (!item.name?.trim()) warn('有一個物品還沒取名字。', { dialog: 'items' })
    if (!obtainable.has(item.itemId)) warn(`物品「${item.name || '（未命名）'}」沒有任何地方可以取得（沒有物件設成可撿起、沒有事件會給、也不是合成的結果）。`, { dialog: 'items' })
  }

  // ---- scenes nobody can walk into (per stage, from its start scene)
  for (const st of stages) {
    const reachable = new Set()
    const queue = st.startSceneId ? [st.startSceneId] : []
    const targets = gotoTargets.get(st.stageId) ?? new Set()
    while (queue.length) {
      const id = queue.pop()
      if (reachable.has(id) || !sceneById.has(id)) continue
      reachable.add(id)
      for (const t of Object.values(sceneById.get(id).exits)) if (t) queue.push(t)
      for (const t of targets) queue.push(t)
    }
    for (const scene of st.scenes) {
      if (!reachable.has(scene.sceneId)) warn(`${where(st)}場景「${scene.name}」沒有任何路可以走進去（從起始場景到不了）。`, { stageId: st.stageId, sceneId: scene.sceneId })
    }
  }

  // ---- flags that are required somewhere but never set
  const { conditions } = collectEventSources(data)
  const needed = new Set()
  for (const c of conditions) for (const k of ['allFlags', 'anyFlags']) for (const f of c?.[k] ?? []) if (f) needed.add(f)
  for (const f of needed) if (!flagsSet.has(f)) warn(`旗標「${f}」被當成條件使用，但沒有任何事件會設定它。`)

  return { errors, warnings, errorWhere, warningWhere }
}
