import { lockDefaults, repairLock } from './lockLogic.js'
import { emptyMissionData } from './missions.js'

// Logical canvas size (spec-v5 §6.2). Scenes are always laid out in 1600x900 and scaled to the screen.
export const CANVAS_W = 1600
export const CANVAS_H = 900

export const DIRECTIONS = [
  { key: 'up', label: '上', arrow: '⬆️' },
  { key: 'down', label: '下', arrow: '⬇️' },
  { key: 'left', label: '左', arrow: '⬅️' },
  { key: 'right', label: '右', arrow: '➡️' },
  { key: 'forward', label: '前', arrow: '🔼' },
  { key: 'backward', label: '後', arrow: '🔽' },
]
export const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left', forward: 'backward', backward: 'forward' }
export const directionLabel = (key) => DIRECTIONS.find((d) => d.key === key)?.label ?? key

export const OBJECT_TYPE_LABELS = {
  image: '圖片',
  video: '影片',
  icon: '圖示',
  text: '文字',
  hotspot: '隱形點擊區',
  lock: '答案鎖',
}

export function genId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`
}

export function emptyExits() {
  return { up: null, down: null, left: null, right: null, forward: null, backward: null }
}

export function createScene(name, graphPos = { x: 0, y: 0 }) {
  return {
    sceneId: genId('sc'),
    name,
    sceneType: 'normal',
    background: { type: 'color', color: '#1e293b' },
    backgroundMusic: null,
    exits: emptyExits(),
    exitConditions: {},
    objects: [],
    groups: [], // [{ id, name }]: objects point at one with groupId, so a group can be moved or shown as one
    graphPos, // editor-only: where the scene sits in the scene graph
  }
}

export function createStage(title = '第一關') {
  return {
    stageId: genId('st'),
    title,
    intro: '',
    startSceneId: null,
    scenes: [],
    objectives: [],
    completeWhen: null,
    onComplete: [],
    resetOnRetry: false,
    join: 'all', // how several incoming connections unlock this stage: 'all' | 'any'
    graphPos: { x: 0, y: 0 }, // editor-only: where the stage sits on the stage map
  }
}

// Default size and content of each new object.
export function createObject(type, extra = {}) {
  const base = {
    id: genId('ob'),
    type,
    name: OBJECT_TYPE_LABELS[type],
    x: 600,
    y: 300,
    w: 400,
    h: 300,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
  }
  const byType = {
    image: { assetId: null },
    video: { assetId: null, youtubeUrl: '', loop: false, muted: true },
    icon: { icon: '🔑', w: 120, h: 120 },
    text: { html: '<p>點兩下右側面板編輯文字</p>', fontSize: 32, color: '#ffffff', align: 'left', background: '', w: 500, h: 160 },
    hotspot: { w: 200, h: 200 },
    lock: { ...lockDefaults(), name: '答案鎖', w: 120, h: 120 },
  }
  return { ...base, ...byType[type], ...extra }
}

// Fills in anything missing so older / hand-imported drafts never crash the editor.
// Works on a copy; the first stage holds the scenes (the stage map arrives in a later phase).
// entries of a list that are not objects (null, numbers, text from a damaged file) are dropped
const onlyObjects = (list) => (Array.isArray(list) ? list.filter((x) => x && typeof x === 'object' && !Array.isArray(x)) : [])

export function normalizeDraft(raw) {
  const base = emptyMissionData()
  const data = { ...base, ...(raw && typeof raw === 'object' ? raw : {}) }
  data.settings = { ...base.settings, ...(data.settings ?? {}) }
  data.stages = onlyObjects(data.stages).length > 0 ? onlyObjects(data.stages) : [createStage()]
  data.stageLinks = onlyObjects(data.stageLinks)
  data.stages = data.stages.map((stage, si) => ({
    ...createStage(stage.title),
    graphPos: { x: si * 300, y: 0 },
    ...stage,
    objectives: onlyObjects(stage.objectives),
    scenes: onlyObjects(stage.scenes).map((scene, i) => ({
      ...createScene(scene.name ?? `場景 ${i + 1}`, { x: (i % 4) * 260, y: Math.floor(i / 4) * 200 }),
      ...scene,
      exits: { ...emptyExits(), ...(scene.exits && typeof scene.exits === 'object' ? scene.exits : {}) },
      exitConditions: scene.exitConditions && typeof scene.exitConditions === 'object' ? scene.exitConditions : {},
      groups: onlyObjects(scene.groups),
      objects: onlyObjects(scene.objects).map((o) => {
        const object = { visible: true, locked: false, opacity: 1, rotation: 0, ...o }
        return object.type === 'lock' ? repairLock(object) : object
      }),
    })),
  }))
  // two stages / scenes / objects / goals with the same id would mix up their pick lists and events: later copies get a fresh id
  const seen = { st: new Set(), sc: new Set(), ob: new Set(), og: new Set(), gr: new Set() }
  const unique = (kind, id) => {
    const next = typeof id === 'string' && id && !seen[kind].has(id) ? id : genId(kind)
    seen[kind].add(next)
    return next
  }
  for (const stage of data.stages) {
    stage.stageId = unique('st', stage.stageId)
    for (const o of stage.objectives) o.objectiveId = unique('og', o.objectiveId)
    for (const scene of stage.scenes) {
      scene.sceneId = unique('sc', scene.sceneId)
      for (const g of scene.groups) {
        const old = g.id
        g.id = unique('gr', old)
        if (g.id !== old) for (const o of scene.objects) if (o.groupId === old) o.groupId = g.id
      }
      for (const o of scene.objects) o.id = unique('ob', o.id)
    }
  }
  for (const stage of data.stages) {
    if (stage.scenes.length === 0) stage.scenes = [createScene('場景 1')]
    if (!stage.startSceneId || !stage.scenes.some((s) => s.sceneId === stage.startSceneId)) stage.startSceneId = stage.scenes[0]?.sceneId ?? null
  }
  // connections that point at a stage that no longer exists are dropped
  const ids = new Set(data.stages.map((s) => s.stageId))
  data.stageLinks = data.stageLinks.filter((l) => ids.has(l.from) && ids.has(l.to) && l.from !== l.to)
  return data
}

// Light check for a JSON file picked for import. Returns an error message or null.
export function validateImport(parsed) {
  if (!parsed || typeof parsed !== 'object') return '檔案內容不是任務資料'
  if (!Array.isArray(parsed.stages)) return '找不到 stages，這不像是任務備份檔'
  if (typeof parsed.schemaVersion !== 'number') return '缺少 schemaVersion，這不像是任務備份檔'
  if (parsed.schemaVersion > 1) return '這份備份來自比較新的版本，目前無法匯入'
  return null
}

// z-order: the objects array is the truth (last = on top); zIndex mirrors it so data stays spec-shaped.
export function withZIndex(objects) {
  return objects.map((o, i) => (o.zIndex === i ? o : { ...o, zIndex: i }))
}

export function parseYouTubeId(url) {
  const m = String(url ?? '').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/)
  return m ? m[1] : null
}

// Every asset id the mission refers to. Any `assetId` field counts (backgrounds, objects, swap_background,
// play_sound, and whatever later phases add), so the list never silently misses a new kind of reference.
export function collectAssetIds(data) {
  const ids = new Set()
  const walk = (node) => {
    if (Array.isArray(node)) node.forEach(walk)
    else if (node && typeof node === 'object') {
      for (const [key, value] of Object.entries(node)) {
        if (key === 'assetId' && typeof value === 'string' && value) ids.add(value)
        else walk(value)
      }
    }
  }
  walk(data.stages)
  return [...ids]
}
