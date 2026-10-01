import { useEffect, useMemo, useRef, useState } from 'react'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import { collectFlags } from '../lib/missionEvents.js'
import { CANVAS_H, CANVAS_W, validateImport } from '../lib/missionSchema.js'
import GameEngine from '../player/GameEngine.js'
import Player from '../player/Player.jsx'
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
export default function MissionEditor({ missionId, title, initialDraft, initialAssets, save, upload, check, publish, onBack }) {
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
  const [preview, setPreview] = useState(null) // GameEngine while test-playing
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
    latest.current = { actions, object, view, previewing: !!preview }
  })
  useEffect(() => {
    function onKeyDown(e) {
      const { actions: a, object: o, view: v, previewing } = latest.current
      if (previewing) return // keys belong to the game while test-playing
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

  // Event forms need the list of scenes, objects, flags and assets to pick from.
  const ctx = useMemo(
    () => ({
      scenes: stage.scenes,
      objects: stage.scenes.flatMap((sc) => sc.objects.map((o) => ({ id: o.id, name: o.name, sceneName: sc.name }))),
      flags: collectFlags(draft),
      assets,
    }),
    [stage, draft, assets],
  )

  function startPreview() {
    if (!scene) return
    setPreview(new GameEngine({ stage, startSceneId: scene.sceneId }))
  }

  function closePreview() {
    preview?.destroy()
    setPreview(null)
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
        <button type="button" onClick={startPreview} disabled={!scene} className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 rounded-lg px-3 py-1 text-sm font-bold" title="從目前這個場景開始試玩">
          ▶ 試玩
        </button>
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

        {scene && <RightPanel scene={scene} scenes={stage.scenes} stage={stage} object={object} assets={assets} assetMap={assetMap} ctx={ctx} actions={wrappedActions} />}
      </div>

      {preview && <Player engine={preview} assets={assetMap} title={`試玩：${title}`} mode="preview" onExit={closePreview} />}

      {publishState?.phase === 'checking' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 text-white text-xl">儲存並檢查中…</div>
      )}

      {(publishState?.phase === 'report' || publishState?.phase === 'publishing') && (
        <ConfirmDialog
          title={publishState.result.errors.length ? '還不能發布' : '發布這一版給學生？'}
          message={
            publishState.result.errors.length
              ? '下面的錯誤要先修好才能發布：'
              : publishState.result.warnings.length
                ? '有一些提醒，確定沒問題的話可以繼續發布：'
                : '檢查通過，沒有發現問題。發布後學生玩到的就是目前這個版本（草稿之後再改，不會影響學生，直到你再次發布）。'
          }
          confirmText={publishState.result.errors.length ? '知道了' : '確定發布'}
          busyText="發布中..."
          confirmClass="bg-amber-500 hover:bg-amber-400"
          busy={publishState.phase === 'publishing'}
          onCancel={() => setPublishState(null)}
          onConfirm={() => (publishState.result.errors.length ? setPublishState(null) : confirmPublish())}
        >
          {(publishState.result.errors.length > 0 || publishState.result.warnings.length > 0) && (
            <ul className="text-sm flex flex-col gap-1 max-h-60 overflow-y-auto">
              {publishState.result.errors.map((t, i) => (
                <li key={`e${i}`} className="text-red-700">
                  ❌ {t}
                </li>
              ))}
              {publishState.result.warnings.map((t, i) => (
                <li key={`w${i}`} className="text-amber-700">
                  ⚠️ {t}
                </li>
              ))}
            </ul>
          )}
        </ConfirmDialog>
      )}

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
