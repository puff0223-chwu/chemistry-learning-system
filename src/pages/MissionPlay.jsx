import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import PageBackground from '../components/PageBackground.jsx'
import StudentInfoModal from '../components/StudentInfoModal.jsx'
import { createMissionRecorder, missionQueue } from '../lib/missionLogQueue.js'
import { collectAssetIds, normalizeDraft } from '../lib/missionSchema.js'
import { getStudentInfo } from '../lib/studentInfo.js'
import { supabase } from '../lib/supabase.js'
import GameEngine from '../player/GameEngine.js'
import Player from '../player/Player.jsx'
import { preloadAssets } from '../player/preload.js'

const progressKey = (missionId, version, s) => `mission-progress:${missionId}:${version}:${s.grade}|${s.className}|${s.seatNumber}|${s.name}`

function readProgress(key) {
  try {
    const saved = JSON.parse(localStorage.getItem(key))
    return saved?.state && !saved.state.missionDone ? saved : null
  } catch {
    return null
  }
}

function Screen({ children }) {
  return (
    <PageBackground page="task">
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-white text-center">{children}</div>
    </PageBackground>
  )
}

// Student mission page (/mission/:missionId): loads the published version, asks who the student is,
// preloads the pictures, then hands over to the player. Progress is saved on this device, so a refresh resumes.
export default function MissionPlay() {
  const { missionId } = useParams()
  const navigate = useNavigate()
  const [phase, setPhase] = useState('loading') // loading | closed | error | info | resume | preload | playing
  const [error, setError] = useState('')
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [play, setPlay] = useState(null) // { engine, recorder, assets, title }
  const loaded = useRef(null) // { row, data, assets }
  const student = useRef(null)
  const saved = useRef(null)

  useEffect(() => {
    let active = true
    async function load() {
      const { data: row, error: rowError } = await supabase
        .from('published_missions')
        .select('id, title, published_data, published_version')
        .eq('id', missionId)
        .maybeSingle()
      if (rowError) throw rowError
      if (!row) return { closed: true }
      const data = normalizeDraft(row.published_data)
      const ids = collectAssetIds(data)
      const assets = []
      for (let i = 0; i < ids.length; i += 100) {
        const { data: rows, error: assetError } = await supabase.from('mission_assets').select('*').in('id', ids.slice(i, i + 100))
        if (assetError) throw assetError
        assets.push(...rows)
      }
      return { row, data, assets }
    }
    load()
      .then((result) => {
        if (!active) return
        if (result.closed) return setPhase('closed')
        loaded.current = result
        const info = getStudentInfo()
        if (info) begin(info)
        else setPhase('info')
      })
      .catch((err) => {
        if (!active) return
        setError(err.message)
        setPhase('error')
      })
    return () => {
      active = false
    }
    // begin only reads refs; the mission is loaded once per page visit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missionId])

  useEffect(() => () => play?.engine.destroy(), [play])

  function begin(info) {
    student.current = info
    const { row } = loaded.current
    saved.current = readProgress(progressKey(missionId, row.published_version, info))
    if (saved.current) setPhase('resume')
    else startPreload(null)
  }

  async function startPreload(resume) {
    setPhase('preload')
    const { assets } = loaded.current
    await preloadAssets(assets, (done, total) => setProgress({ done, total }))
    launch(resume)
  }

  function launch(resume) {
    const { row, data, assets } = loaded.current
    const info = student.current
    const key = progressKey(missionId, row.published_version, info)
    if (!resume) localStorage.removeItem(key)
    const recorder = createMissionRecorder({
      mission: row,
      version: row.published_version,
      student: info,
      startSeq: resume?.nextSeq ?? 0,
      sessionUuid: resume?.sessionUuid ?? null,
    })
    // Progress and the log sequence number are saved together. Every new log entry re-saves too, otherwise a
    // refresh right after an event would resume with a stale number and reuse one the database already has.
    let engine = null
    const persist = (state) => {
      try {
        localStorage.setItem(key, JSON.stringify({ sessionUuid: recorder.sessionId, nextSeq: recorder.nextSeq(), state }))
      } catch {
        // storage full or blocked: playing still works, only resuming after a refresh is lost
      }
    }
    engine = new GameEngine({
      mission: data,
      saved: resume?.state ?? null,
      onLog: (type, extra) => {
        recorder.log(type, extra)
        if (engine) persist(engine.serialize())
      },
      onPersist: persist,
    })
    setPlay({ engine, recorder, assets: Object.fromEntries(assets.map((a) => [a.id, a])), title: row.title })
    setPhase('playing')
  }

  function leave(quit) {
    if (quit && play) play.engine.log('mission_quit')
    missionQueue.flush()
    navigate('/missions')
  }

  if (phase === 'playing' && play) {
    return <Player engine={play.engine} assets={play.assets} title={play.title} onExit={() => leave(true)} onFinish={() => leave(false)} />
  }
  if (phase === 'info') {
    return (
      <Screen>
        <StudentInfoModal onClose={() => navigate('/missions')} onSubmit={begin} />
      </Screen>
    )
  }
  if (phase === 'resume') {
    return (
      <Screen>
        <div className="glass-card rounded-2xl p-8 max-w-sm w-full flex flex-col gap-4">
          <h2 className="text-2xl font-bold">要繼續上次的進度嗎？</h2>
          <p className="text-sub">這台裝置上有你之前玩到一半的進度。</p>
          <button type="button" onClick={() => startPreload(saved.current)} className="bg-glow text-ink rounded-xl px-4 py-3 text-lg font-bold">
            繼續上次進度
          </button>
          <button type="button" onClick={() => startPreload(null)} className="text-white/70 hover:text-white underline text-sm">
            重新開始
          </button>
        </div>
      </Screen>
    )
  }
  if (phase === 'preload') {
    const percent = progress.total ? Math.round((progress.done / progress.total) * 100) : 100
    return (
      <Screen>
        <h1 className="text-2xl font-bold">{loaded.current?.row.title}</h1>
        <p className="text-sub">正在準備任務…</p>
        <div className="w-72 h-3 rounded-full bg-white/20 overflow-hidden" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full bg-glow transition-all" style={{ width: `${percent}%` }} />
        </div>
        <p className="text-sm text-white/70">
          {progress.done} ／ {progress.total}
        </p>
      </Screen>
    )
  }
  if (phase === 'closed' || phase === 'error') {
    return (
      <Screen>
        <p className="text-xl">{phase === 'closed' ? '這個任務目前沒有開放。' : `載入失敗：${error}`}</p>
        <button type="button" onClick={() => navigate('/missions')} className="border border-white/40 hover:bg-white/10 rounded-full px-5 py-2">
          ← 回任務列表
        </button>
      </Screen>
    )
  }
  return (
    <Screen>
      <p className="text-xl">載入任務中...</p>
    </Screen>
  )
}
