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
}

export const ICON_CHOICES = ['🔑', '🔒', '🔓', '📦', '🧪', '⚗️', '🔬', '🔍', '💡', '📄', '📝', '📖', '🧤', '🥽', '🔥', '💧', '☠️', '⚠️', '❓', '❗', '⭐', '🚪', '🧰', '🩸', '👣', '🧬']

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
  }
  return { ...base, ...byType[type], ...extra }
}

// Fills in anything missing so older / hand-imported drafts never crash the editor.
// Works on a copy; the first stage holds the scenes (the stage map arrives in a later phase).
export function normalizeDraft(raw) {
  const base = emptyMissionData()
  const data = { ...base, ...(raw && typeof raw === 'object' ? raw : {}) }
  data.settings = { ...base.settings, ...(data.settings ?? {}) }
  data.stages = Array.isArray(data.stages) && data.stages.length > 0 ? data.stages : [createStage()]
  data.stages = data.stages.map((stage) => ({
    ...createStage(stage.title),
    ...stage,
    scenes: (stage.scenes ?? []).map((scene, i) => ({
      ...createScene(scene.name ?? `場景 ${i + 1}`, { x: (i % 4) * 260, y: Math.floor(i / 4) * 200 }),
      ...scene,
      exits: { ...emptyExits(), ...(scene.exits ?? {}) },
      objects: (scene.objects ?? []).map((o) => ({ visible: true, locked: false, opacity: 1, rotation: 0, ...o })),
    })),
  }))
  const first = data.stages[0]
  if (first.scenes.length === 0) first.scenes = [createScene('場景 1')]
  if (!first.startSceneId || !first.scenes.some((s) => s.sceneId === first.startSceneId)) {
    first.startSceneId = first.scenes[0]?.sceneId ?? null
  }
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
