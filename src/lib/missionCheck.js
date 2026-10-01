import { collectEventSources, isEmptyCondition, listSources, walkActions } from './missionEvents.js'

// Pre-publish health check (subset of spec-v5 §17.5; the answer-lock checks arrive with the locks).
// `existingAssetIds` = ids that still exist in the asset library.
// Returns { errors: [text], warnings: [text] }. Errors block publishing, warnings can be confirmed.
export function checkMission(data, existingAssetIds) {
  const errors = []
  const warnings = []
  const stage = data.stages[0]
  const sceneById = new Map(stage.scenes.map((s) => [s.sceneId, s]))
  const objectById = new Map(stage.scenes.flatMap((s) => s.objects.map((o) => [o.id, { object: o, scene: s }])))
  const sceneName = (id) => sceneById.get(id)?.name ?? '（不存在的場景）'

  if (stage.scenes.length === 0) errors.push('任務裡沒有任何場景。')
  if (!stage.startSceneId || !sceneById.has(stage.startSceneId)) errors.push('還沒有設定起始場景。')

  // Where does each event list live? Used to name the culprit in messages.
  const lists = []
  const add = (where, list) => list?.length && lists.push({ where, list })
  add('關卡「過關後」', stage.onComplete)
  for (const scene of stage.scenes) {
    add(`場景「${scene.name}」進入時`, scene.onEnter)
    for (const o of scene.objects) add(`場景「${scene.name}」的「${o.name}」被點擊時`, o.onClick)
  }

  const flagsSet = new Set()
  const gotoTargets = new Set()
  const canCompleteByCondition = !isEmptyCondition(stage.completeWhen)
  let canComplete = canCompleteByCondition

  for (const { where, list } of lists) {
    walkActions(list, (a) => {
      switch (a.action) {
        case 'goto_scene':
          if (!a.sceneId) errors.push(`${where}：「前往場景」還沒選場景。`)
          else if (!sceneById.has(a.sceneId)) errors.push(`${where}：「前往場景」指向不存在的場景。`)
          else gotoTargets.add(a.sceneId)
          break
        case 'reveal_object':
        case 'hide_object':
          if (!a.target) errors.push(`${where}：「${a.action === 'reveal_object' ? '顯示' : '隱藏'}物件」還沒選物件。`)
          else if (!objectById.has(a.target)) errors.push(`${where}：「${a.action === 'reveal_object' ? '顯示' : '隱藏'}物件」指向不存在（或已刪除）的物件。`)
          break
        case 'set_flag':
          if (!a.flag) errors.push(`${where}：「設定旗標」沒有填旗標名稱。`)
          else flagsSet.add(a.flag)
          break
        case 'clear_flag':
          if (!a.flag) errors.push(`${where}：「清除旗標」沒有填旗標名稱。`)
          break
        case 'swap_background':
          if (!a.sceneId || !sceneById.has(a.sceneId)) errors.push(`${where}：「更換場景背景」的場景不存在或沒選。`)
          if (!a.assetId) errors.push(`${where}：「更換場景背景」還沒選圖片。`)
          break
        case 'play_sound':
          if (!a.assetId) errors.push(`${where}：「播放音效」還沒選音效。`)
          break
        case 'show_message':
          if (!a.message?.trim()) warnings.push(`${where}：有一則「顯示訊息」是空的。`)
          break
        case 'complete_stage':
          canComplete = true
          break
        default:
      }
    })
  }

  for (const scene of stage.scenes) {
    for (const [dir, target] of Object.entries(scene.exits)) {
      if (target && !sceneById.has(target)) errors.push(`場景「${scene.name}」的「${dir}」出口指向不存在的場景。`)
    }
    if (scene.background?.type === 'image' && !scene.background.assetId) errors.push(`場景「${scene.name}」的背景圖還沒選。`)
    for (const o of scene.objects) {
      if ((o.type === 'image' || (o.type === 'video' && !o.youtubeUrl)) && !o.assetId) {
        warnings.push(`場景「${scene.name}」的「${o.name}」還沒選素材（學生會看到佔位圖）。`)
      }
    }
  }

  // Asset ids that no longer exist in the library (backgrounds and objects).
  for (const scene of stage.scenes) {
    if (scene.background?.assetId && !existingAssetIds.has(scene.background.assetId)) errors.push(`場景「${scene.name}」的背景圖已經從素材庫刪除，請重新選擇。`)
    for (const o of scene.objects) if (o.assetId && !existingAssetIds.has(o.assetId)) errors.push(`場景「${scene.name}」的「${o.name}」用到的素材已經從素材庫刪除，請重新選擇。`)
  }

  // Conditions that still have an empty "which thing?" row, and the stage's automatic-completion box left empty.
  for (const source of listSources(data)) {
    for (const c of source.conditions) {
      const blank = ['allFlags', 'anyFlags', 'notFlags'].some((k) => (c?.[k] ?? []).some((f) => !f))
      if (blank) warnings.push(`${source.label}：有一個條件還沒選是哪件事，目前會被忽略。`)
    }
  }
  if (stage.completeWhen && !canCompleteByCondition) {
    warnings.push('「自動過關」已勾選，但還沒設定要完成哪些事（所以不會自動過關）。')
  }

  // Scenes nobody can walk into.
  const reachable = new Set()
  const queue = stage.startSceneId ? [stage.startSceneId] : []
  while (queue.length) {
    const id = queue.pop()
    if (reachable.has(id) || !sceneById.has(id)) continue
    reachable.add(id)
    for (const t of Object.values(sceneById.get(id).exits)) if (t) queue.push(t)
    for (const t of gotoTargets) queue.push(t)
  }
  for (const scene of stage.scenes) {
    if (!reachable.has(scene.sceneId)) warnings.push(`場景「${scene.name}」沒有任何路可以走進去（從起始場景到不了）。`)
  }

  // Flags that are required somewhere but never set.
  const { conditions } = collectEventSources(data)
  const needed = new Set()
  for (const c of conditions) for (const k of ['allFlags', 'anyFlags']) for (const f of c?.[k] ?? []) needed.add(f)
  for (const f of needed) if (!flagsSet.has(f)) warnings.push(`旗標「${f}」被當成條件使用，但沒有任何事件會設定它。`)

  if (!canComplete) warnings.push('沒有設定過關條件，也沒有任何「完成本關」動作，學生無法過關。')

  return { errors, warnings }
}
