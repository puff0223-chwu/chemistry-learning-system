import { useEffect, useMemo, useRef, useState } from 'react'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import { CANVAS_H, CANVAS_W, validateImport } from '../lib/missionSchema.js'
import LeftPanel from './LeftPanel.jsx'
import RightPanel from './RightPanel.jsx'
import SceneCanvas from './SceneCanvas.jsx'
import SceneGraph from './SceneGraph.jsx'
import useMissionEditor, { getStage } from './useMissionEditor.js'

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
export default function MissionEditor({ missionId, title, initialDraft, initialAssets, save, upload, onBack }) {
  const editor = useMissionEditor({ initialDraft, save, storageKey: `mission-draft-${missionId}` })
  const { draft, scene, object, sceneId, status, savedAt, saveError, canUndo, canRedo, actions } = editor
  const stage = getStage(draft)

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
    latest.current = { actions, object, view }
  })
  useEffect(() => {
    function onKeyDown(e) {
      const { actions: a, object: o, view: v } = latest.current
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
      } else if (v !== 'canvas' || !o) {
        // everything below needs a selected object on the canvas
      } else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        a.duplicateObject(o.id)
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        a.deleteObject(o.id)
      } else if (e.key === 'Escape') {
        a.selectObject(null)
      } else if (e.key.startsWith('Arrow') && !o.locked) {
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
        a.updateObject(o.id, { x: o.x + dx, y: o.y + dy }, { key: `nudge-${o.id}` })
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

  const st = statusText(status, savedAt, saveError)
  const wrappedActions = { ...actions, requestDeleteScene: setDeleteSceneId }

  return (
    <div className="h-screen flex flex-col bg-paper text-navy overflow-hidden">
      <header className="bg-navy text-white px-4 py-2 flex items-center gap-3 shrink-0">
        <button type="button" onClick={handleBack} className="text-sm text-[#c9d6e6] hover:text-white whitespace-nowrap">
          ← 回任務列表
        </button>
        <h1 className="font-bold truncate max-w-xs" title={title}>
          {title}
        </h1>
        <div className="flex rounded-lg overflow-hidden border border-white/30 ml-2 text-sm">
          {[
            ['canvas', '🎨 畫布'],
            ['graph', '🗺️ 場景關聯圖'],
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
        <button type="button" onClick={exportJson} className="text-sm text-[#c9d6e6] hover:text-white">
          匯出備份
        </button>
        <button type="button" onClick={() => importInput.current?.click()} className="text-sm text-[#c9d6e6] hover:text-white">
          匯入備份
        </button>
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
      </header>

      <div className="hidden max-[1279px]:block bg-amber-100 text-amber-900 text-sm px-4 py-1 shrink-0">
        編輯器為桌機設計，建議螢幕寬度 1280 像素以上；目前畫面較窄，部分面板可能擠在一起。
      </div>

      <div className="flex-1 min-h-0 flex min-w-[1100px]">
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
          onAddScene={actions.addScene}
          onAddObject={(type) => actions.addObject(type)}
          onAddAsset={(a) => placeAsset(a)}
          onUpload={handleUpload}
          uploadMessage={uploadMessage}
        />

        {view === 'canvas' ? (
          <div ref={areaRef} className="flex-1 min-w-0 overflow-auto bg-slate-300 flex" onMouseDown={(e) => e.target === e.currentTarget && actions.selectObject(null)}>
            <div className="m-auto p-6">
              {scene ? (
                <SceneCanvas
                  scene={scene}
                  assets={assetMap}
                  selectedId={object?.id ?? null}
                  zoom={zoom}
                  onSelect={actions.selectObject}
                  onChange={actions.updateObject}
                  onDropAsset={(id, pos) => assetMap[id] && placeAsset(assetMap[id], pos)}
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
              onAddScene={actions.addScene}
            />
          </div>
        )}

        {scene && <RightPanel scene={scene} scenes={stage.scenes} stage={stage} object={object} assets={assets} assetMap={assetMap} actions={wrappedActions} />}
      </div>

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
