import { validateLock } from './lockLogic.js'
import { collectEventSources, completionSources, isEmptyCondition, listSources, walkActions } from './missionEvents.js'

// Pre-publish health check (spec-v5 §17.5), for missions of one or several stages.
// `existingAssetIds` = ids that still exist in the asset library.
// Returns { errors: [text], warnings: [text] }. Errors block publishing, warnings can be confirmed.
export function checkMission(data, existingAssetIds) {
  const errors = []
  const warnings = []
  const stages = data.stages
  const multi = stages.length > 1
  const links = data.stageLinks ?? []
  const stageIdOfScene = new Map(stages.flatMap((st) => st.scenes.map((sc) => [sc.sceneId, st.stageId])))
  const sceneById = new Map(stages.flatMap((st) => st.scenes.map((sc) => [sc.sceneId, sc])))
  const objectById = new Map(stages.flatMap((st) => st.scenes.flatMap((s) => s.objects.map((o) => [o.id, { object: o, scene: s }]))))
  const lockById = new Map(stages.flatMap((st) => st.scenes.flatMap((s) => s.objects.filter((o) => o.type === 'lock').map((o) => [o.id, o]))))
  // a group can be the target of "show / hide"
  const groupIds = new Set(stages.flatMap((st) => st.scenes.flatMap((s) => (s.groups ?? []).map((g) => g.id))))
  const objectiveIds = new Set(stages.flatMap((st) => (st.objectives ?? []).map((o) => o.objectiveId)))
  const where = (st) => (multi ? `關卡「${st.title}」：` : '')

  // ---- stages: scenes, start scene, how to finish, and whether anybody can ever get in
  for (const st of stages) {
    if (st.scenes.length === 0) errors.push(`${where(st)}沒有任何場景。`)
    if (!st.startSceneId || !st.scenes.some((s) => s.sceneId === st.startSceneId)) errors.push(`${where(st)}還沒有設定起始場景。`)
    if (st.completeWhen && isEmptyCondition(st.completeWhen)) warnings.push(`${where(st)}「自動過關」已勾選，但還沒設定要完成哪些事（所以不會自動過關）。`)
    const canComplete = !isEmptyCondition(st.completeWhen) || completionSources(data, st.stageId).length > 0
    if (!canComplete) warnings.push(`${where(st)}沒有設定過關條件，也沒有任何「完成本關」動作，學生無法過關。`)
  }
  if (multi) {
    const starters = stages.filter((st) => !links.some((l) => l.to === st.stageId))
    if (starters.length === 0) errors.push('每一關都有別的關卡連到它，沒有一關是一開始就能玩的（連線繞成圈了）。')
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
    for (const st of stages) if (!open.has(st.stageId)) warnings.push(`${where(st)}永遠不會開放（連到它的關卡本身就打不開）。`)
  }

  // ---- every event list in the mission, with a label that names the culprit
  const lists = listSources(data).filter((s) => s.actions.length)
  const flagsSet = new Set()
  const gotoTargets = new Map() // stageId -> Set of scene ids that some event walks to
  const completedByEvent = new Set() // objective ids that some event completes
  for (const { label, stageId, actions } of lists) {
    walkActions(actions, (a) => {
      switch (a.action) {
        case 'goto_scene':
          if (!a.sceneId) errors.push(`${label}：「前往場景」還沒選場景。`)
          else if (!sceneById.has(a.sceneId)) errors.push(`${label}：「前往場景」指向不存在的場景。`)
          else if (stageIdOfScene.get(a.sceneId) !== stageId) errors.push(`${label}：「前往場景」要去的場景在另一關，不能直接跳過去（跨關卡請用關卡連線）。`)
          else gotoTargets.set(stageId, (gotoTargets.get(stageId) ?? new Set()).add(a.sceneId))
          break
        case 'reveal_object':
        case 'hide_object':
          if (!a.target) errors.push(`${label}：「${a.action === 'reveal_object' ? '顯示' : '隱藏'}物件」還沒選物件。`)
          else if (!objectById.has(a.target) && !groupIds.has(a.target)) errors.push(`${label}：「${a.action === 'reveal_object' ? '顯示' : '隱藏'}物件」指向不存在（或已刪除）的物件。`)
          break
        case 'open_lock':
          if (!a.target) errors.push(`${label}：「出一道題目」還沒選是哪一題。`)
          else if (!lockById.has(a.target)) errors.push(`${label}：「出一道題目」指向不存在（或已刪除）的答案鎖。`)
          break
        case 'complete_objective':
          if (!a.objectiveId) errors.push(`${label}：「完成任務目標」還沒選是哪一個目標。`)
          else if (!objectiveIds.has(a.objectiveId)) errors.push(`${label}：「完成任務目標」指向不存在（或已刪除）的目標。`)
          else completedByEvent.add(a.objectiveId)
          break
        case 'set_flag':
          if (!a.flag) errors.push(`${label}：「設定旗標」沒有填旗標名稱。`)
          else flagsSet.add(a.flag)
          break
        case 'clear_flag':
          if (!a.flag) errors.push(`${label}：「清除旗標」沒有填旗標名稱。`)
          break
        case 'swap_background':
          if (!a.sceneId || !sceneById.has(a.sceneId)) errors.push(`${label}：「更換場景背景」的場景不存在或沒選。`)
          if (!a.assetId) errors.push(`${label}：「更換場景背景」還沒選圖片。`)
          break
        case 'play_sound':
          if (!a.assetId) errors.push(`${label}：「播放音效」還沒選音效。`)
          break
        case 'show_message':
          if (!a.message?.trim()) warnings.push(`${label}：有一則「顯示訊息」是空的。`)
          break
        default:
      }
    })
  }

  // ---- objectives
  for (const st of stages) {
    for (const o of st.objectives ?? []) {
      if (!o.text?.trim()) warnings.push(`${where(st)}有一個任務目標還沒寫內容。`)
      if (isEmptyCondition(o.doneWhen) && !completedByEvent.has(o.objectiveId)) {
        warnings.push(`${where(st)}任務目標「${o.text || '（未命名）'}」沒有完成方式（不會自動完成，也沒有任何事件會完成它）。`)
      }
    }
  }
  for (const source of listSources(data)) {
    for (const c of source.conditions) {
      if ((c?.objectivesDone ?? []).some((id) => id && !objectiveIds.has(id))) errors.push(`${source.label}：條件用到已經刪除的任務目標，請重新選擇。`)
      const blank = ['allFlags', 'anyFlags', 'notFlags', 'objectivesDone'].some((k) => (c?.[k] ?? []).some((f) => !f))
      if (blank) warnings.push(`${source.label}：有一個條件還沒選是哪一項，目前會被忽略。`)
    }
  }

  // ---- scenes and objects
  for (const st of stages) {
    for (const scene of st.scenes) {
      for (const o of scene.objects) {
        if (o.type !== 'lock') continue
        const result = validateLock(o)
        for (const t of result.errors) errors.push(`${where(st)}場景「${scene.name}」的答案鎖「${o.name}」：${t}`)
        for (const t of result.warnings) warnings.push(`${where(st)}場景「${scene.name}」的答案鎖「${o.name}」：${t}`)
      }
      for (const [dir, target] of Object.entries(scene.exits)) {
        if (target && !sceneById.has(target)) errors.push(`${where(st)}場景「${scene.name}」的「${dir}」出口指向不存在的場景。`)
        else if (target && stageIdOfScene.get(target) !== st.stageId) errors.push(`${where(st)}場景「${scene.name}」的「${dir}」出口通往另一關的場景，不能這樣連（跨關卡請用關卡連線）。`)
      }
      if (scene.background?.type === 'image' && !scene.background.assetId) errors.push(`${where(st)}場景「${scene.name}」的背景圖還沒選。`)
      if (scene.background?.assetId && !existingAssetIds.has(scene.background.assetId)) errors.push(`${where(st)}場景「${scene.name}」的背景圖已經從素材庫刪除，請重新選擇。`)
      for (const o of scene.objects) {
        if ((o.type === 'image' || (o.type === 'video' && !o.youtubeUrl)) && !o.assetId) {
          warnings.push(`${where(st)}場景「${scene.name}」的「${o.name}」還沒選素材（學生會看到佔位圖）。`)
        }
        if (o.assetId && !existingAssetIds.has(o.assetId)) errors.push(`${where(st)}場景「${scene.name}」的「${o.name}」用到的素材已經從素材庫刪除，請重新選擇。`)
      }
    }
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
      if (!reachable.has(scene.sceneId)) warnings.push(`${where(st)}場景「${scene.name}」沒有任何路可以走進去（從起始場景到不了）。`)
    }
  }

  // ---- flags that are required somewhere but never set
  const { conditions } = collectEventSources(data)
  const needed = new Set()
  for (const c of conditions) for (const k of ['allFlags', 'anyFlags']) for (const f of c?.[k] ?? []) if (f) needed.add(f)
  for (const f of needed) if (!flagsSet.has(f)) warnings.push(`旗標「${f}」被當成條件使用，但沒有任何事件會設定它。`)

  return { errors, warnings }
}
