import { useCallback, useEffect, useRef, useState } from 'react'
import { renameFlag } from '../lib/missionEvents.js'
import { deleteObjects, duplicateObjects, groupObjects, moveBlock, nextSelection, pruneGroups, regroupForCopy, renameGroup, ungroup } from './groupOps.js'
import { createObject, createScene, createStage, emptyExits, genId, normalizeDraft, withZIndex, OPPOSITE } from '../lib/missionSchema.js'

const HISTORY_LIMIT = 50 // spec-v5 §6.3: at least 50 undo steps
const COALESCE_MS = 1000 // consecutive edits of the same thing (dragging, typing) count as one undo step
const AUTOSAVE_MS = 30000
const IMPORTANT_SAVE_DELAY_MS = 2000

// Immutable helpers: the draft is only ever replaced, never mutated, so history can keep references.
const mapStageById = (draft, stageId, fn) => ({ ...draft, stages: draft.stages.map((s) => (s.stageId === stageId ? fn(s) : s)) })
const mapScene = (draft, sceneId, fn) => ({
  ...draft,
  stages: draft.stages.map((st) => (st.scenes.some((sc) => sc.sceneId === sceneId) ? { ...st, scenes: st.scenes.map((sc) => (sc.sceneId === sceneId ? fn(sc) : sc)) } : st)),
})
const mapObjects = (draft, sceneId, fn) => mapScene(draft, sceneId, (sc) => pruneGroups({ ...sc, objects: withZIndex(fn(sc.objects)) }))
// Applies a whole-scene change (from groupOps) and keeps zIndex and the group list consistent.
const mapSceneObjects = (draft, sceneId, fn) => mapScene(draft, sceneId, (sc) => {
  const next = fn(sc)
  return pruneGroups({ ...next, objects: withZIndex(next.objects) })
})

export const getStage = (draft, stageId) => draft.stages.find((s) => s.stageId === stageId) ?? draft.stages[0]
export const getScene = (draft, sceneId) => draft.stages.flatMap((s) => s.scenes).find((sc) => sc.sceneId === sceneId) ?? null

// Gives a copy of a stage new ids everywhere (stage, scenes, objects, groups, objectives), including every place an
// event or exit refers to one of them, so the copy never reaches into the original.
function cloneStage(stage) {
  const map = new Map([[stage.stageId, genId('st')]])
  for (const sc of stage.scenes) {
    map.set(sc.sceneId, genId('sc'))
    for (const g of sc.groups ?? []) map.set(g.id, genId('gr'))
    for (const o of sc.objects) map.set(o.id, genId('ob'))
  }
  for (const ob of stage.objectives ?? []) map.set(ob.objectiveId, genId('og'))
  const walk = (node) => {
    if (typeof node === 'string') return map.get(node) ?? node
    if (Array.isArray(node)) return node.map(walk)
    if (node && typeof node === 'object') return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, walk(v)]))
    return node
  }
  return walk(structuredClone(stage))
}

function readBackup(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

// Holds the whole editing session: the draft, selection, undo/redo history and saving.
// `save(draft)` must return a promise (it writes draft_data); `storageKey` names the offline backup.
export default function useMissionEditor({ initialDraft, save, storageKey }) {
  const [draft, setDraft] = useState(() => normalizeDraft(initialDraft))
  const draftRef = useRef(draft)
  const [selectedStageId, setStageId] = useState(() => draft.stages[0].stageId)
  const stage = getStage(draft, selectedStageId)
  const stageIdRef = useRef(stage.stageId)
  useEffect(() => {
    stageIdRef.current = stage.stageId
  }, [stage.stageId])
  // Everything below that edits "the stage" edits the selected one.
  const mapStage = (d, fn) => mapStageById(d, stageIdRef.current, fn)
  const [selectedSceneId, setSceneId] = useState(() => draft.stages[0].startSceneId)
  // Falls back to the stage's start scene if the selected one vanished (restore, import, undo, another stage).
  const scene = stage.scenes.find((s) => s.sceneId === selectedSceneId) ?? stage.scenes.find((s) => s.sceneId === stage.startSceneId) ?? stage.scenes[0] ?? null
  const sceneId = scene?.sceneId ?? null
  const [objectIds, setObjectIds] = useState([]) // selected objects (a group counts as all its members)
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false })
  const past = useRef([])
  const future = useRef([])
  const lastEdit = useRef({ key: null, time: 0 })

  const savedRef = useRef(draft)
  const [status, setStatus] = useState('saved') // saved | dirty | saving | error
  const [savedAt, setSavedAt] = useState(null)
  const [saveError, setSaveError] = useState(null)
  const savingRef = useRef(false)
  const importantTimer = useRef(null)
  const backupTimer = useRef(null)
  const saveFn = useRef(save)
  useEffect(() => {
    saveFn.current = save
  }, [save])

  const syncHistoryFlags = () => setHistoryState({ canUndo: past.current.length > 0, canRedo: future.current.length > 0 })

  const writeBackup = useCallback(
    (d) => {
      clearTimeout(backupTimer.current)
      backupTimer.current = setTimeout(() => {
        try {
          if (d === savedRef.current) localStorage.removeItem(storageKey)
          else localStorage.setItem(storageKey, JSON.stringify({ draft: d, ts: Date.now() }))
        } catch {
          // storage full / blocked: the backup is a convenience only
        }
      }, 400)
    },
    [storageKey],
  )

  const doSave = useCallback(async () => {
    if (savingRef.current) return false
    const snapshot = draftRef.current
    if (snapshot === savedRef.current) return true
    savingRef.current = true
    setStatus('saving')
    try {
      await saveFn.current(snapshot)
      savedRef.current = snapshot
      setSavedAt(new Date())
      setSaveError(null)
      setStatus(draftRef.current === snapshot ? 'saved' : 'dirty')
      if (draftRef.current === snapshot) {
        try {
          localStorage.removeItem(storageKey)
        } catch {
          // ignore
        }
      }
      return draftRef.current === snapshot
    } catch (err) {
      console.error('[editor] 儲存失敗：', err)
      setSaveError(err.message ?? String(err))
      setStatus('error')
      return false
    } finally {
      savingRef.current = false
    }
  }, [storageKey])

  // Every document change goes through here.
  const commit = useCallback(
    (next, { key = null, important = false } = {}) => {
      const current = draftRef.current
      if (next === current) return
      const now = Date.now()
      const coalesce = key !== null && lastEdit.current.key === key && now - lastEdit.current.time < COALESCE_MS
      if (!coalesce) {
        past.current.push(current)
        if (past.current.length > HISTORY_LIMIT) past.current.shift()
      }
      future.current = []
      lastEdit.current = { key, time: now }
      draftRef.current = next
      setDraft(next)
      setStatus(savingRef.current ? 'saving' : 'dirty')
      syncHistoryFlags()
      writeBackup(next)
      if (important) {
        clearTimeout(importantTimer.current)
        importantTimer.current = setTimeout(doSave, IMPORTANT_SAVE_DELAY_MS)
      }
    },
    [doSave, writeBackup],
  )

  const restore = useCallback(
    (snapshot) => {
      draftRef.current = snapshot
      setDraft(snapshot)
      const st = getStage(snapshot, stageIdRef.current)
      setStageId(st.stageId)
      const scenes = st.scenes
      setSceneId((id) => (scenes.some((s) => s.sceneId === id) ? id : (st.startSceneId ?? scenes[0]?.sceneId ?? null)))
      setObjectIds((ids) => ids.filter((id) => scenes.some((s) => s.objects.some((o) => o.id === id))))
      setStatus(snapshot === savedRef.current ? 'saved' : 'dirty')
      lastEdit.current = { key: null, time: 0 }
      syncHistoryFlags()
      writeBackup(snapshot)
      clearTimeout(importantTimer.current)
      importantTimer.current = setTimeout(doSave, IMPORTANT_SAVE_DELAY_MS)
    },
    [doSave, writeBackup],
  )

  const undo = useCallback(() => {
    if (past.current.length === 0) return
    future.current.push(draftRef.current)
    restore(past.current.pop())
  }, [restore])

  const redo = useCallback(() => {
    if (future.current.length === 0) return
    past.current.push(draftRef.current)
    restore(future.current.pop())
  }, [restore])

  // Autosave every 30 s, retry when the network comes back, warn before leaving with unsaved changes.
  useEffect(() => {
    const timer = setInterval(doSave, AUTOSAVE_MS)
    const onOnline = () => doSave()
    const onBeforeUnload = (e) => {
      if (draftRef.current !== savedRef.current) e.preventDefault()
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      clearInterval(timer)
      clearTimeout(importantTimer.current)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [doSave])

  // ---- actions -----------------------------------------------------------------------------

  const actions = {
    selectScene: (id) => {
      setSceneId(id)
      setObjectIds([])
    },
    // Click a member = its whole group. opts: { additive } (Shift) toggles; { single } (Alt / layer list) ignores the group.
    selectObject: (id, opts) => setObjectIds((cur) => nextSelection(getScene(draftRef.current, sceneId) ?? { objects: [] }, cur, id, opts)),
    selectObjects: (ids) => setObjectIds(ids),

    addScene: () => {
      const d = draftRef.current
      const scenes = getStage(d, stageIdRef.current).scenes
      const scene = createScene(`場景 ${scenes.length + 1}`, { x: (scenes.length % 4) * 260, y: Math.floor(scenes.length / 4) * 200 })
      commit(
        mapStage(d, (st) => ({ ...st, scenes: [...st.scenes, scene], startSceneId: st.startSceneId ?? scene.sceneId })),
        { important: true },
      )
      setSceneId(scene.sceneId)
      setObjectIds([])
    },
    duplicateScene: (id) => {
      const d = draftRef.current
      const src = getScene(d, id)
      if (!src) return
      const copy = {
        ...regroupForCopy(structuredClone(src)),
        sceneId: genId('sc'),
        name: `${src.name}（副本）`,
        exits: emptyExits(),
        graphPos: { x: src.graphPos.x + 40, y: src.graphPos.y + 40 },
      }
      copy.objects = copy.objects.map((o) => ({ ...o, id: genId('ob') }))
      commit(mapStage(d, (st) => ({ ...st, scenes: [...st.scenes, copy] })), { important: true })
      setSceneId(copy.sceneId)
      setObjectIds([])
    },
    deleteScene: (id) => {
      const d = draftRef.current
      const cur = getStage(d, stageIdRef.current)
      if (cur.scenes.length <= 1) return
      const remaining = cur.scenes.filter((s) => s.sceneId !== id)
      const next = mapStage(d, (st) => ({
        ...st,
        scenes: remaining.map((sc) => ({
          ...sc,
          // exits and exit conditions that pointed at the deleted scene are cleared
          exits: Object.fromEntries(Object.entries(sc.exits).map(([k, v]) => [k, v === id ? null : v])),
        })),
        startSceneId: st.startSceneId === id ? remaining[0].sceneId : st.startSceneId,
      }))
      commit(next, { important: true })
      if (sceneId === id) {
        setSceneId(remaining[0].sceneId)
        setObjectIds([])
      }
    },
    updateScene: (id, patch, opts) => commit(mapScene(draftRef.current, id, (sc) => ({ ...sc, ...patch })), opts),
    setStartScene: (id) => commit(mapStage(draftRef.current, (st) => ({ ...st, startSceneId: id })), { important: true }),
    setStageTitle: (title) => commit(mapStage(draftRef.current, (st) => ({ ...st, title })), { key: 'stage-title' }),
    updateStage: (patch, opts) => commit(mapStage(draftRef.current, (st) => ({ ...st, ...patch })), opts),

    // Sets (or clears, with targetId = null) one exit; `alsoReturn` adds the opposite exit on the target if it is free.
    setExit: (fromId, dir, targetId, alsoReturn = false) => {
      let next = mapScene(draftRef.current, fromId, (sc) => ({ ...sc, exits: { ...sc.exits, [dir]: targetId } }))
      if (alsoReturn && targetId) {
        next = mapScene(next, targetId, (sc) => (sc.exits[OPPOSITE[dir]] ? sc : { ...sc, exits: { ...sc.exits, [OPPOSITE[dir]]: fromId } }))
      }
      commit(next, { important: true })
    },
    setGraphPos: (id, pos) => commit(mapScene(draftRef.current, id, (sc) => ({ ...sc, graphPos: pos })), { key: `graph-${id}` }),
    // Moves every scene in one go (the "自動整理" button): positions = { sceneId: { x, y } }.
    setGraphPositions: (positions) =>
      commit(mapStage(draftRef.current, (st) => ({ ...st, scenes: st.scenes.map((sc) => (positions[sc.sceneId] ? { ...sc, graphPos: positions[sc.sceneId] } : sc)) })), { important: true }),

    addObject: (type, extra = {}) => {
      if (!sceneId) return null
      const obj = createObject(type, extra)
      commit(mapObjects(draftRef.current, sceneId, (list) => [...list, obj]), { important: true })
      setObjectIds([obj.id])
      return obj.id
    },
    updateObject: (id, patch, opts) =>
      commit(mapObjects(draftRef.current, sceneId, (list) => list.map((o) => (o.id === id ? { ...o, ...patch } : o))), opts),
    // Several objects at once (moving / resizing a selection) as ONE undo step: patches = [{ id, patch }].
    updateObjects: (patches, opts) => {
      const byId = new Map(patches.map((p) => [p.id, p.patch]))
      commit(mapObjects(draftRef.current, sceneId, (list) => list.map((o) => (byId.has(o.id) ? { ...o, ...byId.get(o.id) } : o))), opts)
    },
    deleteObjects: (ids) => {
      commit(mapSceneObjects(draftRef.current, sceneId, (sc) => deleteObjects(sc, ids)), { important: true })
      setObjectIds((cur) => cur.filter((id) => !ids.includes(id)))
    },
    deleteObject: (id) => actions.deleteObjects([id]),
    duplicateObjects: (ids) => {
      const sc = getScene(draftRef.current, sceneId)
      if (!sc || ids.length === 0) return
      const { scene: next, newIds } = duplicateObjects(sc, ids)
      commit(mapSceneObjects(draftRef.current, sceneId, () => next), { important: true })
      setObjectIds(newIds)
    },
    duplicateObject: (id) => actions.duplicateObjects([id]),
    // where: 'up' | 'down' (one step) | 'top' | 'bottom'. "up" means closer to the viewer = later in the array.
    // Accepts one id or several (a group moves as a block).
    moveLayer: (ids, where) => commit(mapObjects(draftRef.current, sceneId, (list) => moveBlock(list, Array.isArray(ids) ? ids : [ids], where)), { important: false }),

    // ---- groups ----
    groupSelected: () => {
      const sc = getScene(draftRef.current, sceneId)
      if (!sc || objectIds.length < 2) return
      let n = (sc.groups?.length ?? 0) + 1
      while ((sc.groups ?? []).some((g) => g.name === `群組 ${n}`)) n += 1
      const { scene: next } = groupObjects(sc, objectIds, `群組 ${n}`)
      commit(mapSceneObjects(draftRef.current, sceneId, () => next), { important: true })
    },
    ungroup: (groupId) => commit(mapSceneObjects(draftRef.current, sceneId, (sc) => ungroup(sc, groupId)), { important: true }),
    renameGroup: (groupId, name) => commit(mapSceneObjects(draftRef.current, sceneId, (sc) => renameGroup(sc, groupId, name)), { key: `group-name-${groupId}` }),

    // ---- stages and the stage map ----
    selectStage: (id) => {
      const st = getStage(draftRef.current, id)
      setStageId(st.stageId)
      setSceneId(st.startSceneId)
      setObjectIds([])
    },
    // A new stage; when the stage you are on leads nowhere yet, it is connected to the new one (a simple chain by default).
    addStage: () => {
      const d = draftRef.current
      const n = d.stages.length + 1
      const fresh = createStage(`第 ${n} 關`)
      const sc = createScene('場景 1')
      fresh.scenes = [sc]
      fresh.startSceneId = sc.sceneId
      fresh.graphPos = { x: Math.max(...d.stages.map((s) => s.graphPos?.x ?? 0)) + 300, y: 0 }
      const cur = stageIdRef.current
      const leadsSomewhere = (d.stageLinks ?? []).some((l) => l.from === cur)
      const links = leadsSomewhere ? d.stageLinks : [...(d.stageLinks ?? []), { id: genId('lk'), from: cur, to: fresh.stageId }]
      commit({ ...d, stages: [...d.stages, fresh], stageLinks: links }, { important: true })
      setStageId(fresh.stageId)
      setSceneId(sc.sceneId)
      setObjectIds([])
    },
    duplicateStage: (id) => {
      const d = draftRef.current
      const src = d.stages.find((s) => s.stageId === id)
      if (!src) return
      const copy = cloneStage(src)
      copy.title = `${src.title}（副本）`
      copy.graphPos = { x: (src.graphPos?.x ?? 0) + 40, y: (src.graphPos?.y ?? 0) + 160 }
      commit({ ...d, stages: [...d.stages, copy] }, { important: true })
      setStageId(copy.stageId)
      setSceneId(copy.startSceneId)
      setObjectIds([])
    },
    deleteStage: (id) => {
      const d = draftRef.current
      if (d.stages.length <= 1) return
      const stages = d.stages.filter((s) => s.stageId !== id)
      commit({ ...d, stages, stageLinks: (d.stageLinks ?? []).filter((l) => l.from !== id && l.to !== id) }, { important: true })
      if (stageIdRef.current === id) {
        setStageId(stages[0].stageId)
        setSceneId(stages[0].startSceneId)
        setObjectIds([])
      }
    },
    setStageGraphPos: (id, pos) => commit(mapStageById(draftRef.current, id, (st) => ({ ...st, graphPos: pos })), { key: `stagepos-${id}` }),
    setStagePositions: (positions) => commit({ ...draftRef.current, stages: draftRef.current.stages.map((st) => (positions[st.stageId] ? { ...st, graphPos: positions[st.stageId] } : st)) }, { important: true }),
    updateStageById: (id, patch, opts) => commit(mapStageById(draftRef.current, id, (st) => ({ ...st, ...patch })), opts),
    addLink: (from, to) => {
      const d = draftRef.current
      if (from === to || (d.stageLinks ?? []).some((l) => l.from === from && l.to === to)) return
      commit({ ...d, stageLinks: [...(d.stageLinks ?? []), { id: genId('lk'), from, to }] }, { important: true })
    },
    updateLink: (id, patch, opts) => commit({ ...draftRef.current, stageLinks: draftRef.current.stageLinks.map((l) => (l.id === id ? { ...l, ...patch } : l)) }, opts),
    removeLink: (id) => commit({ ...draftRef.current, stageLinks: draftRef.current.stageLinks.filter((l) => l.id !== id) }, { important: true }),
    // ---- items (the mission-wide list of things a student can pick up) ----
    setItems: (items, opts) => commit({ ...draftRef.current, items }, opts ?? { important: true }),
    setCombinations: (combinations, opts) => commit({ ...draftRef.current, combinations }, opts ?? { important: true }),
    // A new item; returns its id so the caller can pick it right away.
    addItem: (name) => {
      const d = draftRef.current
      const id = genId('it')
      commit({ ...d, items: [...d.items, { itemId: id, name: name ?? `物品 ${d.items.length + 1}`, icon: '📦', assetId: null, description: '' }] }, { important: true })
      return id
    },
    // Deleting an item also drops the combinations that used it; objects and events that still point at it are caught by the health check.
    deleteItem: (id) => {
      const d = draftRef.current
      commit({ ...d, items: d.items.filter((it) => it.itemId !== id), combinations: d.combinations.filter((c) => c.a !== id && c.b !== id && c.result !== id) }, { important: true })
    },
    updateSettings: (patch) => commit({ ...draftRef.current, settings: { ...draftRef.current.settings, ...patch } }, { important: true }),

    // Renames a progress marker everywhere it is remembered or checked.
    renameFlag: (from, to) => commit(renameFlag(draftRef.current, from, to), { important: true }),

    replaceDraft: (raw) => {
      const next = normalizeDraft(raw)
      commit(next, { important: true })
      const first = getStage(next, null)
      setStageId(first.stageId)
      setSceneId(first.startSceneId)
      setObjectIds([])
    },
    undo,
    redo,
    saveNow: doSave,
    // Offers the offline backup (if newer than what the database gave us) — returns it or null.
    findBackup: () => {
      const backup = readBackup(storageKey)
      if (!backup?.draft) return null
      return JSON.stringify(backup.draft) === JSON.stringify(savedRef.current) ? null : backup
    },
    applyBackup: (backup) => {
      const next = normalizeDraft(backup.draft)
      commit(next, { important: true })
      setStageId(getStage(next, null).stageId)
      setSceneId(getStage(next, null).startSceneId)
      setObjectIds([])
    },
    discardBackup: () => {
      try {
        localStorage.removeItem(storageKey)
      } catch {
        // ignore
      }
    },
  }

  const selectedIds = objectIds.filter((id) => scene?.objects.some((o) => o.id === id))
  const object = selectedIds.length === 1 ? scene.objects.find((o) => o.id === selectedIds[0]) : null
  const objectId = object?.id ?? null

  return { draft, stage, stageId: stage.stageId, scene, object, sceneId, objectId, objectIds: selectedIds, status, savedAt, saveError, ...historyState, actions }
}
