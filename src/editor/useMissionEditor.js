import { useCallback, useEffect, useRef, useState } from 'react'
import { createObject, createScene, emptyExits, genId, normalizeDraft, withZIndex, OPPOSITE } from '../lib/missionSchema.js'

const HISTORY_LIMIT = 50 // spec-v5 §6.3: at least 50 undo steps
const COALESCE_MS = 1000 // consecutive edits of the same thing (dragging, typing) count as one undo step
const AUTOSAVE_MS = 30000
const IMPORTANT_SAVE_DELAY_MS = 2000

// Immutable helpers: the draft is only ever replaced, never mutated, so history can keep references.
const mapStage = (draft, fn) => ({ ...draft, stages: draft.stages.map((s, i) => (i === 0 ? fn(s) : s)) })
const mapScene = (draft, sceneId, fn) => mapStage(draft, (st) => ({ ...st, scenes: st.scenes.map((sc) => (sc.sceneId === sceneId ? fn(sc) : sc)) }))
const mapObjects = (draft, sceneId, fn) => mapScene(draft, sceneId, (sc) => ({ ...sc, objects: withZIndex(fn(sc.objects)) }))

export const getStage = (draft) => draft.stages[0]
export const getScene = (draft, sceneId) => draft.stages[0].scenes.find((s) => s.sceneId === sceneId) ?? null

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
  const [selectedSceneId, setSceneId] = useState(() => getStage(draft).startSceneId)
  // Falls back to the start scene if the selected one vanished (restore, import, undo), so the canvas never goes blank.
  const scene = getScene(draft, selectedSceneId) ?? getScene(draft, getStage(draft).startSceneId) ?? getStage(draft).scenes[0] ?? null
  const sceneId = scene?.sceneId ?? null
  const [objectId, setObjectId] = useState(null)
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
      const scenes = getStage(snapshot).scenes
      setSceneId((id) => (scenes.some((s) => s.sceneId === id) ? id : (getStage(snapshot).startSceneId ?? scenes[0]?.sceneId ?? null)))
      setObjectId((id) => (id && scenes.some((s) => s.objects.some((o) => o.id === id)) ? id : null))
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
      setObjectId(null)
    },
    selectObject: setObjectId,

    addScene: () => {
      const d = draftRef.current
      const scenes = getStage(d).scenes
      const scene = createScene(`場景 ${scenes.length + 1}`, { x: (scenes.length % 4) * 260, y: Math.floor(scenes.length / 4) * 200 })
      commit(
        mapStage(d, (st) => ({ ...st, scenes: [...st.scenes, scene], startSceneId: st.startSceneId ?? scene.sceneId })),
        { important: true },
      )
      setSceneId(scene.sceneId)
      setObjectId(null)
    },
    duplicateScene: (id) => {
      const d = draftRef.current
      const src = getScene(d, id)
      if (!src) return
      const copy = {
        ...structuredClone(src),
        sceneId: genId('sc'),
        name: `${src.name}（副本）`,
        exits: emptyExits(),
        graphPos: { x: src.graphPos.x + 40, y: src.graphPos.y + 40 },
        objects: src.objects.map((o) => ({ ...structuredClone(o), id: genId('ob') })),
      }
      commit(mapStage(d, (st) => ({ ...st, scenes: [...st.scenes, copy] })), { important: true })
      setSceneId(copy.sceneId)
      setObjectId(null)
    },
    deleteScene: (id) => {
      const d = draftRef.current
      const stage = getStage(d)
      if (stage.scenes.length <= 1) return
      const remaining = stage.scenes.filter((s) => s.sceneId !== id)
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
        setObjectId(null)
      }
    },
    updateScene: (id, patch, opts) => commit(mapScene(draftRef.current, id, (sc) => ({ ...sc, ...patch })), opts),
    setStartScene: (id) => commit(mapStage(draftRef.current, (st) => ({ ...st, startSceneId: id })), { important: true }),
    setStageTitle: (title) => commit(mapStage(draftRef.current, (st) => ({ ...st, title })), { key: 'stage-title' }),

    // Sets (or clears, with targetId = null) one exit; `alsoReturn` adds the opposite exit on the target if it is free.
    setExit: (fromId, dir, targetId, alsoReturn = false) => {
      let next = mapScene(draftRef.current, fromId, (sc) => ({ ...sc, exits: { ...sc.exits, [dir]: targetId } }))
      if (alsoReturn && targetId) {
        next = mapScene(next, targetId, (sc) => (sc.exits[OPPOSITE[dir]] ? sc : { ...sc, exits: { ...sc.exits, [OPPOSITE[dir]]: fromId } }))
      }
      commit(next, { important: true })
    },
    setGraphPos: (id, pos) => commit(mapScene(draftRef.current, id, (sc) => ({ ...sc, graphPos: pos })), { key: `graph-${id}` }),

    addObject: (type, extra = {}) => {
      if (!sceneId) return null
      const obj = createObject(type, extra)
      commit(mapObjects(draftRef.current, sceneId, (list) => [...list, obj]), { important: true })
      setObjectId(obj.id)
      return obj.id
    },
    updateObject: (id, patch, opts) =>
      commit(mapObjects(draftRef.current, sceneId, (list) => list.map((o) => (o.id === id ? { ...o, ...patch } : o))), opts),
    deleteObject: (id) => {
      commit(mapObjects(draftRef.current, sceneId, (list) => list.filter((o) => o.id !== id)), { important: true })
      setObjectId((cur) => (cur === id ? null : cur))
    },
    duplicateObject: (id) => {
      const src = getScene(draftRef.current, sceneId)?.objects.find((o) => o.id === id)
      if (!src) return
      const copy = { ...structuredClone(src), id: genId('ob'), name: `${src.name}（副本）`, x: src.x + 30, y: src.y + 30 }
      commit(mapObjects(draftRef.current, sceneId, (list) => [...list, copy]), { important: true })
      setObjectId(copy.id)
    },
    // where: 'up' | 'down' (one step) | 'top' | 'bottom'. "up" means closer to the viewer = later in the array.
    moveLayer: (id, where) => {
      commit(
        mapObjects(draftRef.current, sceneId, (list) => {
          const i = list.findIndex((o) => o.id === id)
          if (i < 0) return list
          const copy = [...list]
          const [item] = copy.splice(i, 1)
          const target = where === 'top' ? copy.length : where === 'bottom' ? 0 : where === 'up' ? Math.min(i + 1, copy.length) : Math.max(i - 1, 0)
          copy.splice(target, 0, item)
          return copy
        }),
        { important: false },
      )
    },

    replaceDraft: (raw) => {
      const next = normalizeDraft(raw)
      commit(next, { important: true })
      const first = getStage(next)
      setSceneId(first.startSceneId)
      setObjectId(null)
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
      setSceneId(getStage(next).startSceneId)
      setObjectId(null)
    },
    discardBackup: () => {
      try {
        localStorage.removeItem(storageKey)
      } catch {
        // ignore
      }
    },
  }

  const object = scene?.objects.find((o) => o.id === objectId) ?? null

  return { draft, scene, object, sceneId, objectId, status, savedAt, saveError, ...historyState, actions }
}
