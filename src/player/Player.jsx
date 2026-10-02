import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import RichContent from '../components/RichContent.jsx'
import SceneView from '../editor/SceneView.jsx'
import { assetUrl } from '../lib/assets.js'
import { collectFlags, usesElapsedTime } from '../lib/missionEvents.js'
import { CANVAS_H, CANVAS_W, DIRECTIONS } from '../lib/missionSchema.js'
import { BagDrawer, ItemViewDialog, Toasts } from './BagUi.jsx'
import LockDialog from './LockDialog.jsx'
import { ObjectivesBar, StageMapScreen } from './StageUi.jsx'

const TRANSITION_MS = 450

// Where each exit button sits on screen.
const EXIT_POSITIONS = {
  left: 'left-3 top-1/2 -translate-y-1/2',
  right: 'right-3 top-1/2 -translate-y-1/2',
  up: 'top-14 left-1/2 -translate-x-1/2',
  down: 'bottom-3 left-1/2 -translate-x-1/2',
  forward: 'bottom-24 right-3',
  backward: 'bottom-24 left-3',
}

// the same, while the test-play tool panel (16rem wide, top right) is open
const EXIT_POSITIONS_TOOLS_OPEN = { right: 'right-[17.5rem] top-1/2 -translate-y-1/2', forward: 'bottom-24 right-[17.5rem]' }

// Extends the scene past its 16:9 frame so wider or taller screens do not show bars. Rendered INSIDE the frame's box
// and positioned outside it:
//  - a picture background gets mirrored copies on each side. A mirror shows exactly the same pixels at the seam, so
//    the join is invisible; a soft shadow grows away from the seam so the extension reads as "outside the scene";
//  - a plain colour needs nothing: the screen itself takes that colour (see `screenColor`).
// The copies tuck 2px under the frame: the frame's size is fractional, and without the overlap a hair-thin gap shows.
const OVERLAP = 'calc(100% - 2px)'

function Backdrop({ background, assets }) {
  const asset = background?.type === 'image' ? assets[background.assetId] : null
  if (!asset) return null
  const src = assetUrl(asset.storage_path)
  const mirror = (key, place, flip) => (
    <img key={key} src={src} alt="" draggable={false} className="absolute object-cover pointer-events-none select-none" style={{ width: '100%', height: '100%', transform: flip, ...place }} />
  )
  const shade = (key, place, toward) => (
    <div key={key} className="absolute pointer-events-none" style={{ width: '100%', height: '100%', background: `linear-gradient(to ${toward}, rgba(0,0,0,0), rgba(0,0,0,0.6))`, ...place }} />
  )
  return (
    <>
      {mirror('l', { right: OVERLAP, top: 0 }, 'scaleX(-1)')}
      {mirror('r', { left: OVERLAP, top: 0 }, 'scaleX(-1)')}
      {mirror('t', { left: 0, bottom: OVERLAP }, 'scaleY(-1)')}
      {mirror('b', { left: 0, top: OVERLAP }, 'scaleY(-1)')}
      {/* the four corners, mirrored both ways, so no black block shows where the side copies meet the top / bottom ones */}
      {mirror('tl', { right: OVERLAP, bottom: OVERLAP }, 'scale(-1, -1)')}
      {mirror('tr', { left: OVERLAP, bottom: OVERLAP }, 'scale(-1, -1)')}
      {mirror('bl', { right: OVERLAP, top: OVERLAP }, 'scale(-1, -1)')}
      {mirror('br', { left: OVERLAP, top: OVERLAP }, 'scale(-1, -1)')}
      {shade('sl', { right: OVERLAP, top: 0 }, 'left')}
      {shade('sr', { left: OVERLAP, top: 0 }, 'right')}
      {shade('st', { left: 0, bottom: OVERLAP }, 'top')}
      {shade('sb', { left: 0, top: OVERLAP }, 'bottom')}
      {shade('s1', { right: OVERLAP, bottom: OVERLAP }, 'top left')}
      {shade('s2', { left: OVERLAP, bottom: OVERLAP }, 'top right')}
      {shade('s3', { right: OVERLAP, top: OVERLAP }, 'bottom left')}
      {shade('s4', { left: OVERLAP, top: OVERLAP }, 'bottom right')}
    </>
  )
}

function ExitButton({ direction, onClick, toolsOpen }) {
  const d = DIRECTIONS.find((x) => x.key === direction)
  const pill = direction === 'forward' || direction === 'backward'
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`往${d.label}`}
      className={`absolute z-20 bg-black/50 hover:bg-black/70 active:bg-black/80 text-white backdrop-blur-sm transition-colors ${toolsOpen && (direction === 'right' || direction === 'forward') ? EXIT_POSITIONS_TOOLS_OPEN[direction] : EXIT_POSITIONS[direction]} ${
        pill ? 'rounded-full px-5 py-3 text-lg font-bold' : 'w-14 h-14 rounded-full text-2xl'
      }`}
    >
      {pill ? `${d.arrow} ${d.label}` : d.arrow}
    </button>
  )
}

function DebugPanel({ engine, state, scenes, flags, onClose }) {
  const devices = [...engine.objects.values()].map((x) => x.object).filter((o) => o.type === 'device')
  return (
    <div className="absolute top-14 right-3 z-40 w-64 max-h-[80%] overflow-y-auto bg-white text-navy rounded-xl shadow-xl p-3 flex flex-col gap-3 text-sm">
      <div className="flex items-center justify-between">
        <p className="font-bold">🛠 試玩工具</p>
        <button type="button" onClick={onClose} className="text-slate-500 hover:text-navy">
          ✕
        </button>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-slate-500">跳到場景</span>
        <select value={state.sceneId ?? ''} onChange={(e) => engine.enterScene(e.target.value, 'fade')} className="bg-white border border-slate-300 rounded-lg px-2 py-1">
          {scenes.map((s) => (
            <option key={s.sceneId} value={s.sceneId}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <div>
        <p className="text-xs text-slate-500 mb-1">旗標（勾選＝已發生；可手動切換測試）</p>
        {flags.length === 0 && <p className="text-xs text-slate-400">這個任務還沒有用到旗標。</p>}
        {flags.map((f) => (
          <label key={f} className="flex items-center gap-2 py-0.5">
            <input type="checkbox" checked={state.flags[f] === true} onChange={(e) => engine.setFlag(f, e.target.checked)} />
            {f}
          </label>
        ))}
      </div>
      {(engine.mission.items ?? []).length > 0 && (
        <div>
          <p className="text-xs text-slate-500 mb-1">證物袋（勾選＝手上有這個物品）</p>
          {engine.mission.items.map((it) => (
            <label key={it.itemId} className="flex items-center gap-2 py-0.5">
              <input type="checkbox" checked={state.items.includes(it.itemId)} onChange={(e) => (e.target.checked ? engine.addItem(it.itemId) : engine.removeItem(it.itemId))} />
              {it.icon} {it.name}
            </label>
          ))}
        </div>
      )}
      {devices.length > 0 && (
        <div>
          <p className="text-xs text-slate-500 mb-1">裝置的狀態（會觸發它的事件）</p>
          {devices.map((d) => (
            <label key={d.id} className="flex items-center gap-2 py-0.5">
              <span className="flex-1 truncate">{d.name}</span>
              <select value={state.devices?.[d.id] ?? ''} onChange={(e) => engine.setDeviceState(d.id, e.target.value)} className="bg-white border border-slate-300 rounded-lg px-1 py-0.5">
                {(d.states ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      )}
      <button type="button" onClick={() => engine.restart()} className="bg-slate-100 hover:bg-slate-200 rounded-lg py-1.5">
        ↺ 從頭重新開始（清除旗標）
      </button>
    </div>
  )
}

// Plays one stage. `engine` holds the game; this component draws it, handles input, the scene-change
// animation, messages, the intro and the end screen. mode: 'play' (students) | 'preview' (editor test play).
export default function Player({ engine, assets, title, mode = 'play', onExit, onFinish }) {
  const state = useSyncExternalStore(engine.subscribe, engine.getSnapshot)
  const scene = engine.scene()
  const stage = engine.stage

  // the element that gets measured; kept in state (a callback ref) so measuring starts the moment it appears on screen,
  // even when it appears later than this component first rendered
  const [box, setBox] = useState(null)
  const [scale, setScale] = useState(0.5)
  const [portrait, setPortrait] = useState(false)
  const [rotateHintClosed, setRotateHintClosed] = useState(false)
  const [leaving, setLeaving] = useState(null) // { sceneId, kind, seq }
  const [messages, setMessages] = useState([])
  const [muted, setMuted] = useState(false)
  const mutedRef = useRef(false)
  const [intro, setIntro] = useState(null) // { stage, resolve } while a stage's opening text is showing
  const [confirmExit, setConfirmExit] = useState(false)
  const [lockOpen, setLockOpen] = useState(null) // { id, resolve } while a lock's dialog is showing
  const [debugOpen, setDebugOpen] = useState(mode === 'preview')
  const [toasts, setToasts] = useState([]) // short auto-fading messages
  const [bagOpen, setBagOpen] = useState(false)
  const [held, setHeld] = useState(null) // id of the item in the student's hand
  const [viewItem, setViewItem] = useState(null)
  const [moved, setMoved] = useState({ sceneId: null, map: {} }) // objects the student dragged aside in this scene (not saved)

  const onMap = !scene && engine.multiStage // standing at the stage map
  const flags = useMemo(() => (mode === 'preview' ? collectFlags(engine.mission) : []), [mode, engine])

  useEffect(() => {
    mutedRef.current = muted
  }, [muted])

  // Fit the 1600x900 scene into whatever screen we have.
  useEffect(() => {
    const el = box
    if (!el) return // not on screen while the stage map is showing
    const measure = () => {
      setScale(Math.min(el.clientWidth / CANVAS_W, el.clientHeight / CANVAS_H))
      setPortrait(el.clientHeight > el.clientWidth * 1.1) // a tall screen shows the 16:9 scene small
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [box])

  // The engine asks the UI to show messages and play sounds.
  useEffect(() => {
    engine.ui = {
      message: (text) => new Promise((resolve) => setMessages((list) => [...list, { text, resolve }])),
      intro: (st) => new Promise((resolve) => setIntro({ stage: st, resolve })),
      toast: (text) => {
        const id = Math.random()
        setToasts((list) => [...list.slice(-2), { id, text }])
        setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 2600)
      },
      lock: (id) => new Promise((resolve) => setLockOpen({ id, resolve })),
      closeLock: () =>
        setLockOpen((cur) => {
          cur?.resolve()
          return null
        }),
      sound: (assetId) => {
        const asset = assets[assetId]
        if (!asset || mutedRef.current) return
        new Audio(assetUrl(asset.storage_path)).play().catch(() => {})
      },
    }
  }, [engine, assets])

  // Start once, even if React remounts us in development.
  useEffect(() => {
    if (engine.startedOnce) return
    engine.startedOnce = true
    // the editor's "試答看看" opens one question as soon as the game has started
    engine.start().then(() => engine.autoOpenLock && engine.openLock(engine.autoOpenLock))
  }, [engine])

  // Animate scene changes: keep the old scene underneath while the new one slides/fades in.
  const transition = state.transition
  useEffect(() => {
    if (!transition) return
    setLeaving({ sceneId: transition.from, kind: transition.kind, seq: transition.seq })
    const timer = setTimeout(() => setLeaving((cur) => (cur?.seq === transition.seq ? null : cur)), TRANSITION_MS)
    return () => clearTimeout(timer)
  }, [transition])

  // Only needed when some condition depends on elapsed time.
  const ticking = useMemo(() => usesElapsedTime(engine.mission), [engine])
  useEffect(() => {
    if (!ticking) return
    const timer = setInterval(() => engine.tick(), 1000)
    return () => clearInterval(timer)
  }, [ticking, engine])

  const leavingScene = leaving ? engine.scenes.get(leaving.sceneId) : null
  const dismissMessage = useCallback(() => {
    setMessages(([first, ...rest]) => {
      first?.resolve()
      return rest
    })
  }, [])

  useEffect(() => {
    if (messages.length === 0) return
    const onKey = (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), dismissMessage())
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [messages.length, dismissMessage])

  const blocked = messages.length > 0 || !!intro || state.missionDone || !!lockOpen || !!viewItem
  const bag = engine.bag()
  const showBag = !onMap && engine.mission.settings?.showBag !== false && (engine.mission.items ?? []).length > 0
  // an item that left the bag (put into a socket, combined) can no longer be "in hand"
  const heldNow = held && state.items.includes(held) ? held : null

  // Everything the student can do to an object in the scene: tap it, or (with an item in hand) put the item into a socket.
  const latestInput = useRef(null)
  useEffect(() => {
    latestInput.current = { blocked, scale, heldNow, sceneId: scene?.sceneId ?? null }
  })
  function handleObjectClick(o) {
    const now = latestInput.current
    if (now.blocked) return
    if (o.type === 'socket' && now.heldNow) {
      setHeld(null)
      engine.useItemOnSocket(o.id, now.heldNow)
      return
    }
    engine.clickObject(o)
  }
  // Dragging an object aside ("翻找"); a press that hardly moves counts as a tap.
  function handleObjectPointerDown(e, o) {
    if (latestInput.current.blocked || e.button > 0) return
    e.preventDefault()
    const sceneId = latestInput.current.sceneId
    const start = { x: e.clientX, y: e.clientY, base: (moved.sceneId === sceneId ? moved.map[o.id] : null) ?? { dx: 0, dy: 0 }, away: false }
    const move = (ev) => {
      const dx = ev.clientX - start.x
      const dy = ev.clientY - start.y
      if (!start.away && Math.hypot(dx, dy) > 6) start.away = true
      if (!start.away) return
      const k = latestInput.current.scale || 1
      setMoved((cur) => ({ sceneId, map: { ...(cur.sceneId === sceneId ? cur.map : {}), [o.id]: { dx: start.base.dx + dx / k, dy: start.base.dy + dy / k } } }))
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      if (!start.away) handleObjectClick(o)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }
  const offsets = moved.sceneId === (scene?.sceneId ?? null) ? moved.map : {}

  if (!scene && !onMap) {
    return (
      <div className="fixed inset-0 bg-black text-white flex flex-col items-center justify-center gap-4">
        <p className="text-xl">這個任務還沒有可以玩的場景。</p>
        <button type="button" onClick={onExit} className="bg-white/20 hover:bg-white/30 rounded-xl px-5 py-2">
          返回
        </button>
      </div>
    )
  }

  // The scene's background decides what lies beyond its frame: a plain colour fills the whole screen with that colour,
  // a picture is mirrored outwards (see Backdrop).
  const sceneBackground = scene ? engine.background(scene) : null
  const screenColor = onMap ? '#0f172a' : sceneBackground?.type === 'color' ? sceneBackground.color : '#000'

  const seconds = engine.elapsedSeconds()
  const sceneProps = { assets, interactive: true, isVisible: engine.isVisible, isSolved: (id) => engine.lockState(id).solved, deviceStateOf: (o) => state.devices?.[o.id], offsets, onObjectClick: handleObjectClick, onObjectPointerDown: handleObjectPointerDown }

  return (
    <div className="fixed inset-0 overflow-hidden select-none z-40" style={{ touchAction: 'manipulation', background: screenColor }}>
      {onMap && <StageMapScreen engine={engine} state={state} />}
      {!onMap && (
      <div ref={setBox} className="absolute inset-0 flex items-center justify-center">
        <div className="relative" style={{ width: CANVAS_W * scale, height: CANVAS_H * scale }}>
          <Backdrop background={sceneBackground} assets={assets} />
          <div className="absolute inset-0 overflow-hidden">
          {leavingScene && (
            <div key={`out-${leaving.seq}`} className={`absolute inset-0 pointer-events-none tr-out-${leaving.kind}`}>
              <div style={{ transform: `scale(${scale})`, transformOrigin: '0 0' }}>
                <SceneView scene={leavingScene} assets={assets} isVisible={engine.isVisible} background={engine.background(leavingScene)} />
              </div>
            </div>
          )}
          <div key={`in-${scene.sceneId}-${transition?.seq ?? 0}`} className={`absolute inset-0 ${transition ? `tr-in-${transition.kind}` : ''}`}>
            <div style={{ transform: `scale(${scale})`, transformOrigin: '0 0' }}>
              <SceneView
                scene={scene}
                {...sceneProps}
                background={engine.background(scene)}
                onObjectError={(o) => engine.log('object_error', { blockId: o.id })}
              />
            </div>
          </div>
          </div>
        </div>
      </div>
      )}

      {/* Exit buttons sit on the edges of the SCREEN (the picture is extended to fill it), so they are easy to reach on any screen shape.
          When the test-play tool panel is open it covers the right edge, so the right-hand arrows step aside. */}
      {!onMap && scene && !blocked && DIRECTIONS.filter((d) => scene.exits[d.key] && engine.scenes.has(scene.exits[d.key])).map((d) => (
        <ExitButton key={d.key} direction={d.key} onClick={() => engine.tryExit(d.key)} toolsOpen={mode === 'preview' && debugOpen} />
      ))}

      {!onMap && <ObjectivesBar engine={engine} />}

      <Toasts items={toasts} />
      {showBag && bagOpen && <BagDrawer engine={engine} bag={bag} assets={assets} held={heldNow} setHeld={setHeld} onView={setViewItem} onClose={() => setBagOpen(false)} blocked={blocked} />}
      {viewItem && <ItemViewDialog item={viewItem} assets={assets} onClose={() => setViewItem(null)} />}

      <div className="absolute top-3 left-3 right-3 z-30 flex items-center gap-2 pointer-events-none">
        <button type="button" onClick={() => setConfirmExit(true)} className="pointer-events-auto bg-black/50 hover:bg-black/70 text-white rounded-full px-4 py-2 text-sm">
          ← {mode === 'preview' ? '結束試玩' : '離開'}
        </button>
        {engine.multiStage && !onMap && (
          <button type="button" onClick={() => engine.leaveStage()} className="pointer-events-auto bg-black/50 hover:bg-black/70 text-white rounded-full px-4 py-2 text-sm whitespace-nowrap">
            🧭 關卡地圖
          </button>
        )}
        <span className="text-white/80 text-sm truncate drop-shadow">
          {title}
          {engine.multiStage && !onMap ? ` ・ ${stage.title}` : ''}
        </span>
        <span className="flex-1" />
        <span className="text-white/70 text-sm tabular-nums drop-shadow">
          {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
        </span>
        {showBag && (
          <button type="button" onClick={() => setBagOpen((o) => !o)} className={`pointer-events-auto rounded-full px-4 h-10 text-sm text-white ${bagOpen ? 'bg-cyan' : 'bg-black/50 hover:bg-black/70'}`}>
            🎒 證物袋{bag.length ? `（${bag.length}）` : ''}
          </button>
        )}
        <button type="button" onClick={() => setMuted((m) => !m)} aria-label={muted ? '開啟聲音' : '靜音'} className="pointer-events-auto bg-black/50 hover:bg-black/70 text-white rounded-full w-10 h-10">
          {muted ? '🔇' : '🔊'}
        </button>
        {mode === 'preview' && (
          <button type="button" onClick={() => setDebugOpen((o) => !o)} className="pointer-events-auto bg-black/50 hover:bg-black/70 text-white rounded-full px-3 h-10 text-sm">
            🛠 工具
          </button>
        )}
      </div>

      {portrait && !rotateHintClosed && (
        <div className="absolute top-16 left-3 right-3 z-30 bg-amber-100 text-amber-900 rounded-xl px-3 py-2 text-sm flex items-center gap-2 shadow">
          <span className="flex-1">📱 把裝置轉成「橫向」，畫面會變大很多。</span>
          <button type="button" onClick={() => setRotateHintClosed(true)} className="font-bold px-2">
            知道了
          </button>
        </div>
      )}

      {mode === 'preview' && debugOpen && <DebugPanel engine={engine} state={state} scenes={stage.scenes} flags={flags} onClose={() => setDebugOpen(false)} />}

      {intro && (
        <div className="absolute inset-0 z-50 flex items-center justify-center px-4" style={{ backgroundColor: 'rgba(0, 10, 30, 0.85)' }}>
          <div className="bg-white text-navy rounded-2xl p-6 w-full max-w-xl max-h-[80%] overflow-y-auto flex flex-col gap-4 shadow-2xl">
            <h2 className="text-xl font-bold">{intro.stage.title}</h2>
            <RichContent html={intro.stage.intro} className="text-lg leading-relaxed" />
            <button
              type="button"
              onClick={() => {
                intro.resolve()
                setIntro(null)
              }}
              className="bg-cyan hover:bg-cyan-dark text-white rounded-xl px-4 py-3 text-lg font-bold"
            >
              開始
            </button>
          </div>
        </div>
      )}

      {lockOpen && (
        // one dialog per question: when an event opens the next question right after one was solved, the old answer must not carry over
        <LockDialog
          key={lockOpen.id}
          engine={engine}
          lockId={lockOpen.id}
          assets={assets}
          state={state}
          onClose={() =>
            setLockOpen((cur) => {
              cur?.resolve()
              return null
            })
          }
        />
      )}

      {messages.length > 0 && (
        <div className="absolute inset-0 z-50 flex items-end justify-center px-4 pb-10" style={{ backgroundColor: 'rgba(0, 10, 30, 0.45)' }}>
          <div className="bg-white text-navy rounded-2xl p-5 w-full max-w-2xl flex flex-col gap-3 shadow-2xl">
            <p className="text-xl leading-relaxed whitespace-pre-wrap">{messages[0].text}</p>
            <button type="button" autoFocus onClick={dismissMessage} className="self-end bg-cyan hover:bg-cyan-dark text-white rounded-xl px-6 py-2 font-bold">
              好
            </button>
          </div>
        </div>
      )}

      {state.missionDone && (
        <div className="absolute inset-0 z-50 flex items-center justify-center px-4" style={{ backgroundColor: 'rgba(0, 10, 30, 0.85)' }}>
          <div className="bg-white text-navy rounded-2xl p-8 w-full max-w-md flex flex-col items-center gap-4 shadow-2xl text-center">
            <p className="text-5xl">🎉</p>
            <h2 className="text-2xl font-bold">{mode === 'preview' ? '試玩結束' : '任務完成！'}</h2>
            <p className="text-slate-600">
              花費時間：{Math.floor(seconds / 60)} 分 {seconds % 60} 秒
            </p>
            {mode === 'preview' && (
              <button type="button" onClick={() => engine.restart()} className="bg-slate-100 hover:bg-slate-200 rounded-xl px-5 py-2">
                ↺ 重新試玩
              </button>
            )}
            <button type="button" onClick={onFinish ?? onExit} className="bg-cyan hover:bg-cyan-dark text-white rounded-xl px-6 py-2 font-bold">
              {mode === 'preview' ? '回到編輯器' : '回到任務列表'}
            </button>
          </div>
        </div>
      )}

      {confirmExit && (
        <ConfirmDialog
          title={mode === 'preview' ? '結束試玩？' : '要離開任務嗎？'}
          message={mode === 'preview' ? '試玩的狀態不會保存，回到編輯器。' : '目前的進度會保留，下次回來可以接著玩。'}
          confirmText={mode === 'preview' ? '結束試玩' : '離開'}
          confirmClass="bg-cyan hover:bg-cyan-dark"
          onCancel={() => setConfirmExit(false)}
          onConfirm={onExit}
        />
      )}
    </div>
  )
}
