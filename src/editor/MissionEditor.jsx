import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { checkMission } from '../lib/missionCheck.js'
import ErrorBoundary from '../components/ErrorBoundary.jsx'
import { PanelCrash } from '../components/CrashPage.jsx'
import ContextMenu from './ContextMenu.jsx'
import ItemsDialog from './ItemsDialog.jsx'
import LockWizard from './LockWizard.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import { collectFlags, completionSources, flagUsage } from '../lib/missionEvents.js'
import { CANVAS_H, CANVAS_W, validateImport } from '../lib/missionSchema.js'
import GameEngine from '../player/GameEngine.js'
import Player from '../player/Player.jsx'
import FlagManager from './FlagManager.jsx'
import IconPicker from './IconPicker.jsx'
import { autoLayout } from './graphLayout.js'
import { iconName } from './icons.js'
import LeftPanel from './LeftPanel.jsx'
import RightPanel from './RightPanel.jsx'
import SceneCanvas from './SceneCanvas.jsx'
import SceneGraph from './SceneGraph.jsx'
import StageDialog from './StageDialog.jsx'
import StageMap from './StageMap.jsx'
import useMissionEditor from './useMissionEditor.js'

const ZOOMS = [
  { value: 'fit', label: '適合' },
  { value: 0.5, label: '50%' },
  { value: 0.75, label: '75%' },
  { value: 1, label: '100%' },
]

const isTyping = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
const pad = (n) => String(n).padStart(2, '0')
const clock = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

function statusText(status, savedAt, saveError) {
  if (status === 'saving') return { text: '儲存中…', tone: 'text-slate-500' }
  if (status === 'dirty') return { text: '尚有未儲存的變更', tone: 'text-amber-600' }
  if (status === 'error') return { text: `儲存失敗（${saveError}）；已暫存在這台電腦，網路恢復會自動重試`, tone: 'text-red-600' }
  return { text: savedAt ? `已儲存 ${clock(savedAt)}` : '已儲存', tone: 'text-emerald-600' }
}

// The full-screen scene editor. It knows nothing about Supabase: the page hands in the draft, the assets
// and the save / upload functions, so it can also be exercised on its own.
// Remembers a yes/no choice (here: which side panels are open) in this browser; fine if storage is blocked.
function usePersistedFlag(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const saved = localStorage.getItem(key)
      return saved === null ? initial : saved === '1'
    } catch {
      return initial
    }
  })
  const update = (next) => {
    setValue(next)
    try {
      localStorage.setItem(key, next ? '1' : '0')
    } catch {
      // not saved, only forgotten on reload
    }
  }
  return [value, update]
}

// The little round tab on a side panel's edge that folds it away (and brings it back), to give the canvas more room.
function PanelToggle({ side, open, onToggle }) {
  const place = side === 'left' ? (open ? '-right-3' : 'left-0') : open ? '-left-3' : 'right-0'
  const arrow = side === 'left' ? (open ? '‹' : '›') : open ? '›' : '‹'
  const label = side === 'left' ? '左邊的場景與素材面板' : '右邊的屬性面板'
  return (
    <button
      type="button"
      onClick={onToggle}
      title={open ? `收起${label}（畫布會變大）` : `展開${label}`}
      aria-label={open ? `收起${label}` : `展開${label}`}
      className={`absolute top-3 z-20 w-6 h-10 rounded-full bg-white border border-slate-300 shadow text-slate-600 hover:bg-cyan hover:text-white font-bold ${place}`}
    >
      {arrow}
    </button>
  )
}

const REPORT_LIMIT = 60 // the check list shows this many of each kind, so a huge mission does not flood the screen

export default function MissionEditor({ missionId, title, initialDraft, initialAssets, save, upload, check, publish, onBack }) {
  const editor = useMissionEditor({ initialDraft, save, storageKey: `mission-draft-${missionId}` })
  const { draft, stage, scene, object, objectIds, sceneId, status, savedAt, saveError, canUndo, canRedo, actions } = editor
  const multiStage = draft.stages.length > 1

  const [assets, setAssets] = useState(initialAssets)
  const assetMap = useMemo(() => Object.fromEntries(assets.map((a) => [a.id, a])), [assets])
  const [view, setView] = useState('canvas')
  const [zoomMode, setZoomMode] = useState('fit')
  const [fitZoom, setFitZoom] = useState(0.6)
  const [uploadMessage, setUploadMessage] = useState('')
  const [deleteSceneId, setDeleteSceneId] = useState(null)
  const [backup, setBackup] = useState(() => actions.findBackup())
  const [pendingImport, setPendingImport] = useState(null)
  const [message, setMessage] = useState(null)
  const [iconPickerFor, setIconPickerFor] = useState(null) // object id while choosing an icon
  const [stageOpen, setStageOpen] = useState(false)
  const [stageTab, setStageTab] = useState('flow')
  const [flagsOpen, setFlagsOpen] = useState(false)
  const [preview, setPreview] = useState(null) // GameEngine while test-playing
  const [leftOpen, setLeftOpen] = usePersistedFlag('editor-left-open', true)
  const [rightOpen, setRightOpen] = usePersistedFlag('editor-right-open', true)
  const [itemsOpen, setItemsOpen] = useState(false)
  const [menu, setMenu] = useState(null) // right-click menu: { x, y, title, items }
  const [wizardFor, setWizardFor] = useState(null) // id of the lock the 題目精靈 is editing
  const closeMenu = useCallback(() => setMenu(null), [])
  const [publishState, setPublishState] = useState(null) // { phase: 'checking' | 'report' | 'publishing', result? }
  const areaRef = useRef(null)
  const importInput = useRef(null)

  const zoom = zoomMode === 'fit' ? fitZoom : zoomMode

  useEffect(() => {
    const el = areaRef.current
    if (!el || view !== 'canvas') return
    const measure = () => setFitZoom(Math.max(0.2, Math.min((el.clientWidth - 48) / CANVAS_W, (el.clientHeight - 48) / CANVAS_H)))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [view])

  // Keyboard shortcuts always use the freshest actions.
  const latest = useRef(null)
  useEffect(() => {
    latest.current = { actions, object, objectIds, scene, view, previewing: !!preview, modal: !!wizardFor }
  })
  useEffect(() => {
    function onKeyDown(e) {
      const { actions: a, objectIds: ids, scene: sc, view: v, previewing, modal } = latest.current
      if (previewing || modal) return // keys belong to the game while test-playing, or to the open dialog
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        a.saveNow()
        return
      }
      if (isTyping(document.activeElement)) return
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) a.redo()
        else a.undo()
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        a.redo()
      } else if (v !== 'canvas' || ids.length === 0) {
        // everything below needs a selection on the canvas
      } else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        a.duplicateObjects(ids)
      } else if (mod && e.key.toLowerCase() === 'g') {
        e.preventDefault()
        a.groupSelected()
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        a.deleteObjects(ids)
      } else if (e.key === 'Escape') {
        a.selectObject(null)
      } else if (e.key.startsWith('Arrow')) {
        const movable = (sc?.objects ?? []).filter((x) => ids.includes(x.id) && !x.locked)
        if (movable.length === 0) return
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
        a.updateObjects(
          movable.map((x) => ({ id: x.id, patch: { x: x.x + dx, y: x.y + dy } })),
          { key: 'nudge-selection' },
        )
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Place an asset in the current scene, sized to fit comfortably (images keep their proportions).
  function placeAsset(asset, at) {
    if (!scene) return
    const isImage = asset.type === 'image'
    let w = isImage ? (asset.width ?? 600) : 640
    let h = isImage ? (asset.height ?? 400) : 360
    const fit = Math.min(1, 900 / w, 600 / h)
    w = Math.round(w * fit)
    h = Math.round(h * fit)
    const cx = at?.x ?? CANVAS_W / 2
    const cy = at?.y ?? CANVAS_H / 2
    actions.addObject(isImage ? 'image' : 'video', {
      assetId: asset.id,
      name: asset.name || (isImage ? '圖片' : '影片'),
      w,
      h,
      x: Math.round(Math.min(Math.max(0, cx - w / 2), CANVAS_W - w)),
      y: Math.round(Math.min(Math.max(0, cy - h / 2), CANVAS_H - h)),
    })
  }

  async function handleUpload(files) {
    for (const file of files) {
      setUploadMessage(`上傳中：${file.name}…`)
      try {
        const { asset, status: result } = await upload(file)
        setAssets((prev) => (prev.some((a) => a.id === asset.id) ? prev : [asset, ...prev]))
        setUploadMessage(result === 'exists' ? `「${file.name}」素材庫已經有了` : `✅ ${file.name}`)
      } catch (err) {
        setUploadMessage(`❌ ${file.name}：${err.message}`)
        return
      }
    }
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${title || 'mission'}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleImportFile(file) {
    try {
      const parsed = JSON.parse(await file.text())
      const problem = validateImport(parsed)
      if (problem) setMessage(`無法匯入：${problem}`)
      else setPendingImport(parsed)
    } catch {
      setMessage('無法匯入：這不是有效的 JSON 檔案')
    }
  }

  // Leaving saves first; if saving fails we stay, so nothing is lost.
  async function handleBack() {
    for (let i = 0; i < 2; i++) {
      if (await actions.saveNow()) return onBack()
    }
    setMessage("儲存失敗，所以先不離開。請檢查網路後再試一次（草稿已暫存在這台電腦）。")
  }

  // Event forms need the list of scenes, objects, flags and assets to pick from.
  const ctx = useMemo(
    () => ({
      scenes: stage.scenes,
      objects: stage.scenes.flatMap((sc) => sc.objects.map((o) => ({ id: o.id, name: o.name, type: o.type, sceneName: sc.name }))),
      groups: stage.scenes.flatMap((sc) => (sc.groups ?? []).map((g) => ({ id: g.id, name: g.name, sceneName: sc.name }))),
      flags: collectFlags(draft),
      // for conditions: places, objects and questions of the WHOLE mission (what the game tracks is mission-wide)
      places: draft.stages.flatMap((st) => st.scenes.map((sc) => ({ id: sc.sceneId, name: sc.name, stageTitle: st.title }))),
      things: draft.stages.flatMap((st) => st.scenes.flatMap((sc) => sc.objects.filter((o) => o.type !== 'lock').map((o) => ({ id: o.id, name: o.name, type: o.type, sceneName: draft.stages.length > 1 ? `${st.title}・${sc.name}` : sc.name })))),
      items: draft.items.map((it) => ({ id: it.itemId, name: it.name, icon: it.icon })),
      devices: draft.stages.flatMap((st) => st.scenes.flatMap((sc) => sc.objects.filter((o) => o.type === 'device').map((o) => ({ id: o.id, name: o.name, sceneName: sc.name, states: (o.states ?? []).map((s) => ({ id: s.id, name: s.name, icon: s.icon })) })))),
      locks: draft.stages.flatMap((st) => st.scenes.flatMap((sc) => sc.objects.filter((o) => o.type === 'lock').map((o) => ({ id: o.id, name: o.name, type: o.type, sceneName: draft.stages.length > 1 ? `${st.title}・${sc.name}` : sc.name })))),
      objectives: draft.stages.flatMap((st) => (st.objectives ?? []).map((o) => ({ id: o.objectiveId, text: o.text || '（還沒命名的目標）', stageTitle: st.title }))),
      assets,
    }),
    [stage, draft, assets],
  )

  const usage = useMemo(() => flagUsage(draft), [draft])

  // `at` = where it was right-clicked (logical canvas pixels); without it the object starts in the middle.
  function addObject(type, at) {
    const size = { icon: [120, 120], text: [500, 160], hotspot: [200, 200], lock: [120, 120], socket: [160, 160], device: [200, 200] }[type]
    const extra = at && size ? { x: Math.round(Math.max(0, Math.min(CANVAS_W - size[0], at.x - size[0] / 2))), y: Math.round(Math.max(0, Math.min(CANVAS_H - size[1], at.y - size[1] / 2))) } : {}
    const id = actions.addObject(type, extra)
    if (type === 'icon' && id) setIconPickerFor(id) // a new icon starts by choosing which one
    if (type === 'lock' && id) setWizardFor(id) // a new answer lock opens the 題目精靈
  }

  function pickIcon(emoji) {
    const target = scene?.objects.find((o) => o.id === iconPickerFor)
    if (target) {
      // Rename only if the teacher has not given it a name of their own yet.
      const untouched = target.name === '圖示' || target.name === iconName(target.icon)
      actions.updateObject(target.id, untouched ? { icon: emoji, name: iconName(emoji) } : { icon: emoji }, { important: true })
    }
    setIconPickerFor(null)
  }

  function startPreview() {
    if (!scene) return
    setPreview(new GameEngine({ mission: draft, startSceneId: scene.sceneId }))
  }

  // "試答看看": test-play from the lock's own scene and open just that question.
  function previewLock(lockId) {
    const home = stage.scenes.find((sc) => sc.objects.some((o) => o.id === lockId))
    if (!home) return
    const engine = new GameEngine({ mission: draft, startSceneId: home.sceneId })
    engine.autoOpenLock = lockId
    setPreview(engine)
  }

  function closePreview() {
    preview?.destroy()
    setPreview(null)
  }

  // The same health check as publishing, running all the time, so the teacher sees what is still missing while editing.
  const deferredDraft = useDeferredValue(draft)
  const live = useMemo(() => {
    try {
      return checkMission(deferredDraft, new Set(assets.map((a) => a.id)))
    } catch {
      return { errors: [], warnings: [], errorWhere: [], warningWhere: [] }
    }
  }, [deferredDraft, assets])

  // "去修改": close the report and take the teacher to the place that needs work.
  function goTo(place = {}) {
    setPublishState(null)
    if (place.view === 'stages') {
      setView('stages')
      return
    }
    if (place.stageId && place.stageId !== stage.stageId) actions.selectStage(place.stageId)
    if (place.dialog === 'items') {
      setItemsOpen(true)
      return
    }
    if (place.dialog) {
      setStageTab(place.dialog)
      setStageOpen(true)
      return
    }
    setView('canvas')
    if (place.sceneId) actions.selectScene(place.sceneId)
    if (place.objectId) actions.selectObjects([place.objectId])
  }

  // Publishing: save first, run the health check, show the report, publish on confirmation.
  async function startPublish() {
    setPublishState({ phase: 'checking' })
    try {
      if (!(await actions.saveNow())) throw new Error('草稿還沒存好，請稍後再試')
      setPublishState({ phase: 'report', result: await check(draft) })
    } catch (err) {
      setPublishState(null)
      setMessage(`無法檢查：${err.message}`)
    }
  }

  async function confirmPublish() {
    setPublishState((s) => ({ ...s, phase: 'publishing' }))
    try {
      const version = await publish()
      setPublishState(null)
      setMessage(`已發布第 ${version} 版。學生要在「任務列表」把這個任務設為「開放」才看得到。`)
    } catch (err) {
      setPublishState(null)
      setMessage(`發布失敗：${err.message}`)
    }
  }

  const st = statusText(status, savedAt, saveError)
  // ---- right-click menus ----------------------------------------------------------------------------
  function openObjectMenu(x, y, ids) {
    if (!scene) return
    const objs = scene.objects.filter((o) => ids.includes(o.id))
    if (objs.length === 0) return
    if (ids.length !== objectIds.length || ids.some((id) => !objectIds.includes(id))) actions.selectObjects(ids)
    const one = objs.length === 1 ? objs[0] : null
    const groupId = objs.find((o) => o.groupId)?.groupId
    const allShown = objs.every((o) => o.visible)
    const allLocked = objs.every((o) => o.locked)
    const set = (p) => actions.updateObjects(objs.map((o) => ({ id: o.id, patch: p })), { important: true })
    setMenu({
      x,
      y,
      title: one ? `${one.name}` : `已選 ${objs.length} 個物件`,
      items: [
        one?.type === 'lock' && { icon: '🧙', label: '題目精靈（一步一步設定）', onClick: () => setWizardFor(one.id) },
        one?.type === 'lock' && { icon: '▶', label: '試答看看', onClick: () => previewLock(one.id) },
        one?.type === 'icon' && { icon: '🎨', label: '換圖示…', onClick: () => setIconPickerFor(one.id) },
        'sep',
        { icon: '⧉', label: '複製', hint: 'Ctrl+D', onClick: () => actions.duplicateObjects(ids) },
        objs.length > 1 && { icon: '🗂', label: '組成群組', hint: 'Ctrl+G', onClick: () => actions.groupSelected() },
        groupId && { icon: '🔓', label: '解散群組', onClick: () => actions.ungroup(groupId) },
        'sep',
        { icon: '⤒', label: '移到最上層', onClick: () => actions.moveLayer(ids, 'top') },
        { icon: '↑', label: '上移一層', onClick: () => actions.moveLayer(ids, 'up') },
        { icon: '↓', label: '下移一層', onClick: () => actions.moveLayer(ids, 'down') },
        { icon: '⤓', label: '移到最下層', onClick: () => actions.moveLayer(ids, 'bottom') },
        'sep',
        { icon: allShown ? '🚫' : '👁️', label: allShown ? '一開始先隱藏' : '一開始就顯示', onClick: () => set({ visible: !allShown }) },
        { icon: allLocked ? '🔓' : '🔒', label: allLocked ? '解除鎖定' : '鎖定（避免誤拖）', onClick: () => set({ locked: !allLocked }) },
        'sep',
        { icon: '🗑', label: '刪除', hint: 'Delete', danger: true, onClick: () => actions.deleteObjects(ids) },
      ],
    })
  }

  function openCanvasMenu({ clientX, clientY, objectId, point }) {
    if (!scene) return
    if (objectId) {
      openObjectMenu(clientX, clientY, objectIds.includes(objectId) ? objectIds : [objectId])
      return
    }
    setMenu({
      x: clientX,
      y: clientY,
      title: `場景「${scene.name}」`,
      items: [
        { icon: '🔤', label: '在這裡加文字', onClick: () => addObject('text', point) },
        { icon: '⭐', label: '在這裡加圖示', onClick: () => addObject('icon', point) },
        { icon: '👆', label: '在這裡加隱形點擊區', onClick: () => addObject('hotspot', point) },
        { icon: '🔐', label: '在這裡加答案鎖（精靈帶你設定）', onClick: () => addObject('lock', point) },
        { icon: '🔌', label: '在這裡加插座（放物品的地方）', onClick: () => addObject('socket', point) },
        { icon: '💡', label: '在這裡加裝置（有開關、有狀態）', onClick: () => addObject('device', point) },
        'sep',
        scene.objects.length > 0 && { icon: '▦', label: '全選', onClick: () => actions.selectObjects(scene.objects.map((o) => o.id)) },
        scene.sceneId !== stage.startSceneId && { icon: '★', label: '設為起始場景', onClick: () => actions.setStartScene(scene.sceneId) },
        { icon: '⧉', label: '複製這個場景', onClick: () => actions.duplicateScene(scene.sceneId) },
      ],
    })
  }

  function openSceneMenu(x, y, id) {
    const target = stage.scenes.find((s) => s.sceneId === id)
    if (!target) return
    setMenu({
      x,
      y,
      title: `場景「${target.name}」`,
      items: [
        { icon: '📂', label: '開啟這個場景', onClick: () => (actions.selectScene(id), setView('canvas')) },
        { icon: '★', label: '設為起始場景', disabled: id === stage.startSceneId, onClick: () => actions.setStartScene(id) },
        { icon: '⧉', label: '複製場景', onClick: () => actions.duplicateScene(id) },
        'sep',
        { icon: '🗑', label: '刪除場景', danger: true, onClick: () => setDeleteSceneId(id) },
      ],
    })
  }

  const wizardLock = wizardFor ? scene?.objects.find((o) => o.id === wizardFor && o.type === 'lock') : null
  const wrappedActions = { ...actions, requestDeleteScene: setDeleteSceneId, openObjectMenu, openWizard: setWizardFor }

  return (
    <div className="h-screen flex flex-col bg-paper text-navy overflow-hidden">
      <header className="bg-navy text-white px-4 py-2 flex items-center gap-x-2 gap-y-1 flex-wrap shrink-0 [&_button]:whitespace-nowrap">
        <button type="button" onClick={handleBack} className="text-sm text-[#c9d6e6] hover:text-white whitespace-nowrap">
          ← 返回
        </button>
        <h1 className="font-bold truncate max-w-[9rem]" title={title}>
          {title}
        </h1>
        <div className="flex rounded-lg overflow-hidden border border-white/30 ml-2 text-sm">
          {[
            ['canvas', '🎨 畫布'],
            ['graph', '🗺️ 場景圖'],
            ...(multiStage ? [['stages', '🧭 關卡圖']] : []),
          ].map(([key, label]) => (
            <button key={key} type="button" onClick={() => setView(key)} className={`px-3 py-1 ${view === key ? 'bg-cyan text-white' : 'hover:bg-white/10'}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          <button type="button" disabled={!canUndo} onClick={actions.undo} title="復原（Ctrl+Z）" className="px-2 py-1 rounded hover:bg-white/10 disabled:opacity-30">
            ↶ 復原
          </button>
          <button type="button" disabled={!canRedo} onClick={actions.redo} title="重做（Ctrl+Shift+Z）" className="px-2 py-1 rounded hover:bg-white/10 disabled:opacity-30">
            ↷ 重做
          </button>
        </div>
        {multiStage ? (
          <label className="flex items-center gap-1 text-sm" title="目前正在編輯哪一關">
            <span className="text-[#c9d6e6]">關卡：</span>
            <select
              value={stage.stageId}
              onChange={(e) => {
                actions.selectStage(e.target.value)
                if (view === 'stages') setView('canvas')
              }}
              className="bg-white/10 rounded px-2 py-1 max-w-[8rem]"
            >
              {draft.stages.map((st) => (
                <option key={st.stageId} value={st.stageId} className="text-navy">
                  {st.title}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <button
            type="button"
            onClick={() => {
              actions.addStage()
              setView('stages')
            }}
            title="把任務分成好幾關（可以排成一條線、分支或同時開放）"
            className="px-2 py-1 rounded hover:bg-white/10 text-sm"
          >
            ＋ 關卡
          </button>
        )}
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => {
              setStageTab('flow')
              setStageOpen(true)
            }}
            title="開場說明、怎樣算過關、任務目標、重玩時要不要重置"
            className="px-2 py-1 rounded hover:bg-white/10 text-sm"
          >
            🏁 設定
          </button>
          <button type="button" onClick={() => setFlagsOpen(true)} title="學生做過的事（記號）一覽，可改名" className="px-2 py-1 rounded hover:bg-white/10 text-sm">
            📌 記號{usage.size ? ` (${usage.size})` : ''}
          </button>
          <button type="button" onClick={() => setItemsOpen(true)} title="物品清單：學生可以撿起來放進證物袋的東西，以及物品組合" className="px-2 py-1 rounded hover:bg-white/10 text-sm">
            🎒 物品{draft.items.length ? ` (${draft.items.length})` : ''}
          </button>
        </div>
        {view === 'canvas' && (
          <select value={zoomMode} onChange={(e) => setZoomMode(e.target.value === 'fit' ? 'fit' : Number(e.target.value))} aria-label="縮放" className="bg-white/10 rounded px-2 py-1 text-sm">
            {ZOOMS.map((z) => (
              <option key={z.value} value={z.value} className="text-navy">
                畫布 {z.label}
              </option>
            ))}
          </select>
        )}
        <span className="flex-1" />
        <button type="button" onClick={startPreview} disabled={!scene} className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 rounded-lg px-3 py-1 text-sm font-bold" title="從目前這個場景開始試玩">
          ▶ 試玩
        </button>
        <details className="relative text-sm" onMouseLeave={(e) => e.currentTarget.removeAttribute('open')}>
          <summary className="cursor-pointer list-none px-2 py-1 rounded hover:bg-white/10 text-[#c9d6e6]">⋯</summary>
          <div className="absolute right-0 top-full mt-1 z-30 bg-white text-navy rounded-lg shadow-lg p-1 w-44 flex flex-col">
            <button type="button" onClick={exportJson} className="text-left px-3 py-2 rounded hover:bg-slate-100">
              ⬇ 匯出備份檔
            </button>
            <button type="button" onClick={() => importInput.current?.click()} className="text-left px-3 py-2 rounded hover:bg-slate-100">
              ⬆ 匯入備份檔
            </button>
          </div>
        </details>
        <input
          ref={importInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handleImportFile(f)
            e.target.value = ''
          }}
        />
        <span className={`text-sm max-w-xs truncate bg-white rounded px-2 py-0.5 ${st.tone}`} title={st.text}>
          {st.text}
        </span>
        <button type="button" onClick={actions.saveNow} disabled={status === 'saving'} title="Ctrl+S" className="bg-cyan hover:bg-cyan-dark disabled:opacity-60 rounded-lg px-4 py-1.5 font-bold">
          💾 儲存
        </button>
        <button
          type="button"
          onClick={() => setPublishState({ phase: 'report', viewOnly: true, result: live })}
          title={live.errors.length ? `還有 ${live.errors.length} 項一定要修好才能發布，點一下看清單` : live.warnings.length ? `有 ${live.warnings.length} 項提醒（不影響發布），點一下看清單` : '目前沒有發現問題'}
          className={`rounded-lg px-2.5 py-1.5 font-bold text-sm bg-white/10 hover:bg-white/20 ${live.errors.length ? 'text-red-300' : live.warnings.length ? 'text-amber-300' : 'text-emerald-300'}`}
        >
          🩺 {live.errors.length ? `❌${live.errors.length}` : ''}
          {live.warnings.length ? ` ⚠️${live.warnings.length}` : ''}
          {!live.errors.length && !live.warnings.length ? '✅' : ''}
        </button>
        {publish && (
          <button type="button" onClick={startPublish} disabled={!!publishState} title="檢查並發布給學生" className="bg-amber-500 hover:bg-amber-400 disabled:opacity-60 rounded-lg px-4 py-1.5 font-bold">
            📢 發布
          </button>
        )}
      </header>

      <div className="hidden max-[1279px]:block bg-amber-100 text-amber-900 text-sm px-4 py-1 shrink-0">
        編輯器為桌機設計，建議螢幕寬度 1280 像素以上；目前畫面較窄，部分面板可能擠在一起。
      </div>

      <div className="flex-1 min-h-0 flex min-w-[1100px]">
        <div className="relative flex shrink-0">
        <PanelToggle side="left" open={leftOpen} onToggle={() => setLeftOpen(!leftOpen)} />
        {leftOpen && (
        <LeftPanel
          scenes={stage.scenes}
          sceneId={sceneId}
          startSceneId={stage.startSceneId}
          assets={assets}
          assetMap={assetMap}
          onSelectScene={(id) => {
            actions.selectScene(id)
            setView('canvas')
          }}
          onSceneMenu={openSceneMenu}
          onAddScene={actions.addScene}
          onAddObject={addObject}
          onAddAsset={(a) => placeAsset(a)}
          onUpload={handleUpload}
          uploadMessage={uploadMessage}
        />
        )}
        </div>

        {view === 'stages' ? (
          <div className="flex-1 min-w-0">
            <StageMap
              draft={draft}
              stage={stage}
              ctx={ctx}
              actions={actions}
              onOpenStage={(id) => {
                actions.selectStage(id)
                setView('canvas')
              }}
              onEditSettings={(id) => {
                actions.selectStage(id)
                setStageTab('flow')
                setStageOpen(true)
              }}
            />
          </div>
        ) : view === 'canvas' ? (
          <div ref={areaRef} className="flex-1 min-w-0 overflow-auto bg-slate-300 flex" onMouseDown={(e) => e.target === e.currentTarget && actions.selectObject(null)}>
            <div className="m-auto p-6">
              {scene ? (
                <SceneCanvas
                  scene={scene}
                  assets={assetMap}
                  selectedIds={objectIds}
                  zoom={zoom}
                  onSelect={actions.selectObject}
                  onSelectMany={actions.selectObjects}
                  onChange={actions.updateObject}
                  onChangeMany={actions.updateObjects}
                  onDropAsset={(id, pos) => assetMap[id] && placeAsset(assetMap[id], pos)}
                  onContextMenu={openCanvasMenu}
                />
              ) : (
                <p className="text-slate-600">這個任務還沒有場景，按左邊「＋ 新增」建立第一個場景。</p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 min-w-0">
            <SceneGraph
              scenes={stage.scenes}
              startSceneId={stage.startSceneId}
              currentSceneId={sceneId}
              assets={assetMap}
              onOpenScene={(id) => {
                actions.selectScene(id)
                setView('canvas')
              }}
              onConnectExit={actions.setExit}
              onClearExit={(from, dir) => actions.setExit(from, dir, null)}
              onMoveScene={actions.setGraphPos}
              onAutoLayout={() => actions.setGraphPositions(autoLayout(stage.scenes, stage.startSceneId))}
              onAddScene={actions.addScene}
            />
          </div>
        )}

        <div className="relative flex shrink-0">
        <PanelToggle side="right" open={rightOpen} onToggle={() => setRightOpen(!rightOpen)} />
        {scene && rightOpen && (
          // a failure inside the side panel must not blank the whole editor; picking something else resets it
          <ErrorBoundary key={`${sceneId}-${objectIds.join(',')}`} fallback={<PanelCrash />}>
            <RightPanel scene={scene} scenes={stage.scenes} stage={stage} object={object} objectIds={objectIds} assets={assets} assetMap={assetMap} ctx={ctx} actions={wrappedActions} onPickIcon={setIconPickerFor} onPreviewLock={previewLock} />
          </ErrorBoundary>
        )}
        </div>
      </div>

      {menu && <ContextMenu x={menu.x} y={menu.y} title={menu.title} items={menu.items} onClose={closeMenu} />}

      {wizardLock && <LockWizard lock={wizardLock} assets={assets} onChange={(patch, opts) => actions.updateObject(wizardLock.id, patch, opts)} onPreview={() => previewLock(wizardLock.id)} onClose={() => setWizardFor(null)} />}

      {iconPickerFor && <IconPicker current={scene?.objects.find((o) => o.id === iconPickerFor)?.icon} onPick={pickIcon} onClose={() => setIconPickerFor(null)} />}

      {stageOpen && (
        <StageDialog
          stage={stage}
          ctx={ctx}
          completionPlaces={completionSources(draft, stage.stageId)}
          initialTab={stageTab}
          onTitle={actions.setStageTitle}
          onUpdateStage={actions.updateStage}
          onClose={() => setStageOpen(false)}
        />
      )}

      {itemsOpen && (
        <ItemsDialog
          items={draft.items}
          combinations={draft.combinations}
          showBag={draft.settings.showBag}
          assets={assets}
          assetMap={assetMap}
          onItems={actions.setItems}
          onCombinations={actions.setCombinations}
          onAddItem={actions.addItem}
          onDeleteItem={actions.deleteItem}
          onShowBag={(v) => actions.updateSettings({ showBag: v })}
          onClose={() => setItemsOpen(false)}
        />
      )}

      {flagsOpen && <FlagManager usage={usage} onRename={actions.renameFlag} onClose={() => setFlagsOpen(false)} />}

      {preview && <Player engine={preview} assets={assetMap} title={`試玩：${title}`} mode="preview" onExit={closePreview} />}

      {publishState?.phase === 'checking' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 text-white text-xl">儲存並檢查中…</div>
      )}

      {(publishState?.phase === 'report' || publishState?.phase === 'publishing') && (() => {
        const { result, viewOnly } = publishState
        const blocked = result.errors.length > 0
        const Item = ({ text, place, tone }) => (
          <li className={`flex items-start gap-2 rounded-lg px-2 py-1.5 ${tone === 'e' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`}>
            <span className="flex-1">
              {tone === 'e' ? '❌' : '⚠️'} {text}
            </span>
            {place && Object.keys(place).length > 0 && (
              <button type="button" onClick={() => goTo(place)} className="shrink-0 bg-white border border-slate-300 hover:bg-slate-100 text-navy rounded-lg px-2 py-0.5 text-xs font-bold">
                👉 去修改
              </button>
            )}
          </li>
        )
        return (
          <ConfirmDialog
            title={viewOnly ? '🩺 檢查清單' : blocked ? '還不能發布' : '發布這一版給學生？'}
            message={
              blocked
                ? '❌ 一定要修好才能發布；⚠️ 只是提醒，可以不修。每一項右邊的「去修改」會直接帶你到那個地方：'
                : result.warnings.length
                  ? viewOnly
                    ? '沒有一定要修的問題。下面是一些提醒（不影響發布）：'
                    : '沒有一定要修的問題，下面是一些提醒。確定沒問題的話可以直接發布：'
                  : viewOnly
                    ? '目前沒有發現任何問題 👍'
                    : '檢查通過，沒有發現問題。發布後學生玩到的就是目前這個版本（草稿之後再改，不會影響學生，直到你再次發布）。'
            }
            confirmText={viewOnly || blocked ? '關閉' : '確定發布'}
            busyText="發布中..."
            confirmClass={viewOnly || blocked ? 'bg-slate-600 hover:bg-slate-500' : 'bg-amber-500 hover:bg-amber-400'}
            busy={publishState.phase === 'publishing'}
            onCancel={() => setPublishState(null)}
            onConfirm={() => (viewOnly || blocked ? setPublishState(null) : confirmPublish())}
          >
            {(blocked || result.warnings.length > 0) && (
              <ul className="text-sm flex flex-col gap-1.5 max-h-72 overflow-y-auto">
                {result.errors.slice(0, REPORT_LIMIT).map((t, i) => (
                  <Item key={`e${i}`} text={t} place={result.errorWhere?.[i]} tone="e" />
                ))}
                {result.errors.length > REPORT_LIMIT && <li className="text-xs text-slate-500 px-2">…還有 {result.errors.length - REPORT_LIMIT} 項必須修好的問題，先修上面這些再檢查一次。</li>}
                {result.warnings.slice(0, REPORT_LIMIT).map((t, i) => (
                  <Item key={`w${i}`} text={t} place={result.warningWhere?.[i]} tone="w" />
                ))}
                {result.warnings.length > REPORT_LIMIT && <li className="text-xs text-slate-500 px-2">…還有 {result.warnings.length - REPORT_LIMIT} 項提醒沒有列出。</li>}
              </ul>
            )}
          </ConfirmDialog>
        )
      })()}

      {deleteSceneId && (
        <ConfirmDialog
          title={`刪除場景「${stage.scenes.find((s) => s.sceneId === deleteSceneId)?.name}」？`}
          message="場景裡的所有物件會一起刪除，其他場景指向它的出口也會清掉。刪除後可以用「復原」找回。"
          confirmText="確定刪除"
          onCancel={() => setDeleteSceneId(null)}
          onConfirm={() => {
            actions.deleteScene(deleteSceneId)
            setDeleteSceneId(null)
          }}
        />
      )}

      {backup && (
        <ConfirmDialog
          title="找到這台電腦暫存的草稿"
          message={`這台電腦上有一份 ${new Date(backup.ts).toLocaleString('zh-TW')} 暫存、尚未存到雲端的草稿（可能是上次斷線或忘了存檔）。要還原它嗎？選「放棄」會保留雲端目前的內容。`}
          confirmText="還原暫存草稿"
          confirmClass="bg-cyan hover:bg-cyan-dark"
          onCancel={() => {
            actions.discardBackup()
            setBackup(null)
          }}
          onConfirm={() => {
            actions.applyBackup(backup)
            setBackup(null)
          }}
        />
      )}

      {pendingImport && (
        <ConfirmDialog
          title="匯入備份？"
          message="匯入會用備份檔的內容取代目前整份草稿（可用「復原」回到匯入前）。備份裡的素材要在素材庫中存在才會顯示。"
          confirmText="確定匯入"
          confirmClass="bg-cyan hover:bg-cyan-dark"
          onCancel={() => setPendingImport(null)}
          onConfirm={() => {
            actions.replaceDraft(pendingImport)
            setPendingImport(null)
          }}
        />
      )}

      {message && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-navy text-white rounded-xl px-4 py-2 shadow-lg flex gap-3 items-center">
          <span>{message}</span>
          <button type="button" onClick={() => setMessage(null)} className="underline text-sm">
            知道了
          </button>
        </div>
      )}
    </div>
  )
}
