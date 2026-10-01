import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import RichContent from '../components/RichContent.jsx'
import SceneView from '../editor/SceneView.jsx'
import { assetUrl } from '../lib/assets.js'
import { collectFlags, usesElapsedTime } from '../lib/missionEvents.js'
import { CANVAS_H, CANVAS_W, DIRECTIONS } from '../lib/missionSchema.js'

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

const hasText = (html) => !!html && html.replace(/<[^>]*>/g, '').trim().length > 0

function ExitButton({ direction, onClick }) {
  const d = DIRECTIONS.find((x) => x.key === direction)
  const pill = direction === 'forward' || direction === 'backward'
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`往${d.label}`}
      className={`absolute z-20 bg-black/50 hover:bg-black/70 active:bg-black/80 text-white backdrop-blur-sm transition-colors ${EXIT_POSITIONS[direction]} ${
        pill ? 'rounded-full px-5 py-3 text-lg font-bold' : 'w-14 h-14 rounded-full text-2xl'
      }`}
    >
      {pill ? `${d.arrow} ${d.label}` : d.arrow}
    </button>
  )
}

function DebugPanel({ engine, state, scenes, flags, onClose }) {
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

  const boxRef = useRef(null)
  const [scale, setScale] = useState(0.5)
  const [leaving, setLeaving] = useState(null) // { sceneId, kind, seq }
  const [messages, setMessages] = useState([])
  const [muted, setMuted] = useState(false)
  const mutedRef = useRef(false)
  const [phase, setPhase] = useState(() => (!engine.resumed && hasText(stage.intro) ? 'intro' : 'run'))
  const [confirmExit, setConfirmExit] = useState(false)
  const [debugOpen, setDebugOpen] = useState(mode === 'preview')

  const flags = useMemo(() => (mode === 'preview' ? collectFlags({ stages: [stage] }) : []), [mode, stage])

  useEffect(() => {
    mutedRef.current = muted
  }, [muted])

  // Fit the 1600x900 scene into whatever screen we have.
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const measure = () => setScale(Math.min(el.clientWidth / CANVAS_W, el.clientHeight / CANVAS_H))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // The engine asks the UI to show messages and play sounds.
  useEffect(() => {
    engine.ui = {
      message: (text) => new Promise((resolve) => setMessages((list) => [...list, { text, resolve }])),
      sound: (assetId) => {
        const asset = assets[assetId]
        if (!asset || mutedRef.current) return
        new Audio(assetUrl(asset.storage_path)).play().catch(() => {})
      },
    }
  }, [engine, assets])

  // Start once (after the intro), even if React remounts us in development.
  useEffect(() => {
    if (phase !== 'run' || engine.startedOnce) return
    engine.startedOnce = true
    engine.start()
  }, [phase, engine])

  // Animate scene changes: keep the old scene underneath while the new one slides/fades in.
  const transition = state.transition
  useEffect(() => {
    if (!transition) return
    setLeaving({ sceneId: transition.from, kind: transition.kind, seq: transition.seq })
    const timer = setTimeout(() => setLeaving((cur) => (cur?.seq === transition.seq ? null : cur)), TRANSITION_MS)
    return () => clearTimeout(timer)
  }, [transition])

  // Only needed when some condition depends on elapsed time.
  const ticking = useMemo(() => usesElapsedTime({ stages: [stage] }), [stage])
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

  const blocked = messages.length > 0 || phase === 'intro' || state.missionDone

  if (!scene) {
    return (
      <div className="fixed inset-0 bg-black text-white flex flex-col items-center justify-center gap-4">
        <p className="text-xl">這個任務還沒有可以玩的場景。</p>
        <button type="button" onClick={onExit} className="bg-white/20 hover:bg-white/30 rounded-xl px-5 py-2">
          返回
        </button>
      </div>
    )
  }

  const seconds = engine.elapsedSeconds()
  const sceneProps = { assets, interactive: true, isVisible: engine.isVisible, onObjectClick: (o) => !blocked && engine.clickObject(o) }

  return (
    <div className="fixed inset-0 bg-black overflow-hidden select-none z-40" style={{ touchAction: 'manipulation' }}>
      <div ref={boxRef} className="absolute inset-0 flex items-center justify-center">
        <div className="relative overflow-hidden" style={{ width: CANVAS_W * scale, height: CANVAS_H * scale }}>
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

      {!blocked && DIRECTIONS.filter((d) => scene.exits[d.key] && engine.scenes.has(scene.exits[d.key])).map((d) => (
        <ExitButton key={d.key} direction={d.key} onClick={() => engine.tryExit(d.key)} />
      ))}

      <div className="absolute top-3 left-3 right-3 z-30 flex items-center gap-2 pointer-events-none">
        <button type="button" onClick={() => setConfirmExit(true)} className="pointer-events-auto bg-black/50 hover:bg-black/70 text-white rounded-full px-4 py-2 text-sm">
          ← {mode === 'preview' ? '結束試玩' : '離開'}
        </button>
        <span className="text-white/80 text-sm truncate drop-shadow">{title}</span>
        <span className="flex-1" />
        <span className="text-white/70 text-sm tabular-nums drop-shadow">
          {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
        </span>
        <button type="button" onClick={() => setMuted((m) => !m)} aria-label={muted ? '開啟聲音' : '靜音'} className="pointer-events-auto bg-black/50 hover:bg-black/70 text-white rounded-full w-10 h-10">
          {muted ? '🔇' : '🔊'}
        </button>
        {mode === 'preview' && (
          <button type="button" onClick={() => setDebugOpen((o) => !o)} className="pointer-events-auto bg-black/50 hover:bg-black/70 text-white rounded-full px-3 h-10 text-sm">
            🛠 工具
          </button>
        )}
      </div>

      {mode === 'preview' && debugOpen && <DebugPanel engine={engine} state={state} scenes={stage.scenes} flags={flags} onClose={() => setDebugOpen(false)} />}

      {phase === 'intro' && (
        <div className="absolute inset-0 z-50 flex items-center justify-center px-4" style={{ backgroundColor: 'rgba(0, 10, 30, 0.85)' }}>
          <div className="bg-white text-navy rounded-2xl p-6 w-full max-w-xl max-h-[80%] overflow-y-auto flex flex-col gap-4 shadow-2xl">
            <h2 className="text-xl font-bold">{stage.title}</h2>
            <RichContent html={stage.intro} className="text-lg leading-relaxed" />
            <button type="button" onClick={() => setPhase('run')} className="bg-cyan hover:bg-cyan-dark text-white rounded-xl px-4 py-3 text-lg font-bold">
              開始
            </button>
          </div>
        </div>
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
