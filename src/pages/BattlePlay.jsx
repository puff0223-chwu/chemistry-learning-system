import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import HeartDisplay from '../components/HeartDisplay.jsx'

const QUESTION_SECONDS = 180
const MAX_HEARTS = 10
const BG_IMAGE = '/bg-battle.jpg.png'
const OVERLAY = 'rgba(0, 10, 30, 0.75)'

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function normalize(str) {
  return (str ?? '').trim().toLowerCase()
}

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches,
  )
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 768px)')
    const handler = (e) => setIsDesktop(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])
  return isDesktop
}

function RotatedSlot({ rotate, children }) {
  return (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        height: '100vh',
        width: 'calc((100vw - 84px) / 2)',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: '100vh',
          height: 'calc((100vw - 84px) / 2)',
          transform: `translate(-50%, -50%) rotate(${rotate}deg)`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
          gap: '12px',
        }}
      >
        {children}
      </div>
    </div>
  )
}

function PlayerPanel({ label, question, onAnswer, locked, resolved, feedback, selected }) {
  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-[80vh]">
      <h2 className="text-xl font-bold text-glow">{label}</h2>
      {question ? (
        <>
          <p className="text-lg font-bold text-center leading-snug text-white">{question.content}</p>
          <div className="grid grid-cols-1 gap-2 w-full">
            {['A', 'B', 'C', 'D'].map((letter) => {
              const text = question[`option_${letter.toLowerCase()}`]
              if (!text) return null
              const isCorrectPick = resolved && feedback?.type === 'good' && selected === letter
              const isWrongPick = selected === letter && feedback?.type === 'bad' && locked
              let style = {}
              if (isCorrectPick) style = { background: 'rgba(0, 230, 118, 0.25)', border: '1px solid #00E676' }
              else if (isWrongPick) style = { background: 'rgba(255, 82, 82, 0.25)', border: '1px solid #FF5252' }
              return (
                <button
                  key={letter}
                  type="button"
                  disabled={locked || resolved}
                  onClick={() => onAnswer(letter)}
                  className={`text-left disabled:opacity-60 rounded-lg px-4 py-3 text-base transition-colors text-white ${
                    isCorrectPick || isWrongPick ? '' : 'glass-card glow-hover'
                  }`}
                  style={style}
                >
                  <span className="font-bold text-glow mr-2">{letter}.</span>
                  {text}
                </button>
              )
            })}
          </div>
          {feedback && (
            <div
              className="w-full text-center rounded-lg px-3 py-2 font-bold text-white"
              style={
                feedback.type === 'good'
                  ? { background: 'rgba(0, 230, 118, 0.25)', border: '1px solid #00E676' }
                  : { background: 'rgba(255, 82, 82, 0.25)', border: '1px solid #FF5252' }
              }
            >
              {feedback.text}
            </div>
          )}
        </>
      ) : (
        <p className="text-sub">沒有可用的 PK 題目</p>
      )}
    </div>
  )
}

function ControlBar({ horizontal, timeLeft, heartsA, heartsB, hitA, hitB, onNext, onEnd }) {
  return (
    <div
      className={
        horizontal
          ? 'flex flex-row items-center justify-between px-4 py-2 gap-3'
          : 'flex flex-col items-center justify-between py-4 gap-3'
      }
      style={horizontal ? { height: '72px', flexShrink: 0 } : { width: '84px', flexShrink: 0 }}
    >
      <div className={`text-lg font-extrabold ${timeLeft <= 30 ? 'text-badglow animate-pulse' : 'text-white'}`}>
        {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
      </div>
      <HeartDisplay hearts={heartsA} label="A" hit={hitA} />
      <div className={horizontal ? 'w-px h-10 bg-white/20' : 'w-10 h-px bg-white/20'} />
      <HeartDisplay hearts={heartsB} label="B" hit={hitB} />
      <button
        type="button"
        onClick={onNext}
        className="bg-glow text-ink rounded-lg px-2 py-3 text-xs font-bold"
        style={horizontal ? undefined : { writingMode: 'vertical-rl' }}
      >
        ▶ 下一題
      </button>
      <button
        type="button"
        onClick={onEnd}
        className="text-white/60 hover:text-white/90 border border-white/30 rounded-lg px-2 py-3 text-xs"
        style={horizontal ? undefined : { writingMode: 'vertical-rl' }}
      >
        🏳 結束
      </button>
    </div>
  )
}

export default function BattlePlay() {
  const { topicId } = useParams()
  const navigate = useNavigate()
  const isDesktop = useIsDesktop()

  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [qIndex, setQIndex] = useState(0)
  const [heartsA, setHeartsA] = useState(MAX_HEARTS)
  const [heartsB, setHeartsB] = useState(MAX_HEARTS)
  const [lockedA, setLockedA] = useState(false)
  const [lockedB, setLockedB] = useState(false)
  const [selectedA, setSelectedA] = useState(null)
  const [selectedB, setSelectedB] = useState(null)
  const [resolved, setResolved] = useState(false)
  const [feedbackA, setFeedbackA] = useState(null)
  const [feedbackB, setFeedbackB] = useState(null)
  const [timeLeft, setTimeLeft] = useState(QUESTION_SECONDS)
  const [gameEnded, setGameEnded] = useState(false)
  const [hitA, setHitA] = useState(false)
  const [hitB, setHitB] = useState(false)

  const prevHeartsA = useRef(MAX_HEARTS)
  const prevHeartsB = useRef(MAX_HEARTS)

  useEffect(() => {
    if (heartsA < prevHeartsA.current) {
      setHitA(true)
      const t = setTimeout(() => setHitA(false), 350)
      prevHeartsA.current = heartsA
      return () => clearTimeout(t)
    }
    prevHeartsA.current = heartsA
  }, [heartsA])

  useEffect(() => {
    if (heartsB < prevHeartsB.current) {
      setHitB(true)
      const t = setTimeout(() => setHitB(false), 350)
      prevHeartsB.current = heartsB
      return () => clearTimeout(t)
    }
    prevHeartsB.current = heartsB
  }, [heartsB])

  useEffect(() => {
    let active = true
    async function load() {
      const { data: questionData, error: questionError } = await supabase
        .from('questions')
        .select('*')
        .eq('topic_id', topicId)
        .in('mode', ['pk', 'both'])
        .eq('type', 'choice')
      if (!active) return
      if (questionError) setError(questionError.message)
      else setQuestions(shuffle(questionData ?? []))
      setLoading(false)
    }
    load()
    return () => {
      active = false
    }
  }, [topicId])

  const current = questions.length > 0 ? questions[qIndex % questions.length] : null

  const endGame = useCallback(() => {
    setGameEnded(true)
  }, [])

  useEffect(() => {
    if (heartsA <= 0 || heartsB <= 0) {
      endGame()
    }
  }, [heartsA, heartsB, endGame])

  useEffect(() => {
    if (gameEnded || resolved || !current) return
    if (timeLeft <= 0) {
      setResolved(true)
      if (!lockedA) {
        setHeartsA((h) => Math.max(0, h - 1))
        setFeedbackA({ type: 'bad', text: '時間到，未作答 -1 血' })
      }
      if (!lockedB) {
        setHeartsB((h) => Math.max(0, h - 1))
        setFeedbackB({ type: 'bad', text: '時間到，未作答 -1 血' })
      }
      return
    }
    const timer = setTimeout(() => setTimeLeft((t) => t - 1), 1000)
    return () => clearTimeout(timer)
  }, [timeLeft, gameEnded, resolved, current, lockedA, lockedB])

  function handleAnswer(player, letter) {
    if (!current || gameEnded || resolved) return
    if (player === 'A' && lockedA) return
    if (player === 'B' && lockedB) return

    const isCorrect = normalize(letter) === normalize(current.answer)

    if (player === 'A') setSelectedA(letter)
    else setSelectedB(letter)

    if (isCorrect) {
      setResolved(true)
      if (player === 'A') {
        setHeartsB((h) => Math.max(0, h - 1))
        setFeedbackA({ type: 'good', text: '答對了！對方 -1 血' })
        setFeedbackB({ type: 'bad', text: '對方答對了，你 -1 血' })
      } else {
        setHeartsA((h) => Math.max(0, h - 1))
        setFeedbackB({ type: 'good', text: '答對了！對方 -1 血' })
        setFeedbackA({ type: 'bad', text: '對方答對了，你 -1 血' })
      }
    } else if (player === 'A') {
      setLockedA(true)
      setHeartsA((h) => Math.max(0, h - 1))
      setFeedbackA({ type: 'bad', text: '答錯了，-1 血，等待對方作答' })
    } else {
      setLockedB(true)
      setHeartsB((h) => Math.max(0, h - 1))
      setFeedbackB({ type: 'bad', text: '答錯了，-1 血，等待對方作答' })
    }
  }

  function nextQuestion() {
    if (gameEnded) return
    setQIndex((i) => i + 1)
    setLockedA(false)
    setLockedB(false)
    setSelectedA(null)
    setSelectedB(null)
    setResolved(false)
    setFeedbackA(null)
    setFeedbackB(null)
    setTimeLeft(QUESTION_SECONDS)
  }

  function restartGame() {
    setQuestions((qs) => shuffle(qs))
    setQIndex(0)
    setHeartsA(MAX_HEARTS)
    setHeartsB(MAX_HEARTS)
    setLockedA(false)
    setLockedB(false)
    setSelectedA(null)
    setSelectedB(null)
    setResolved(false)
    setFeedbackA(null)
    setFeedbackB(null)
    setTimeLeft(QUESTION_SECONDS)
    setGameEnded(false)
  }

  const backgroundStyle = {
    backgroundImage: `linear-gradient(${OVERLAY}, ${OVERLAY}), url(${BG_IMAGE})`,
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-cover bg-center flex items-center justify-center text-xl text-white" style={backgroundStyle}>
        載入題目中...
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-cover bg-center flex items-center justify-center text-badglow text-xl" style={backgroundStyle}>
        載入失敗：{error}
      </div>
    )
  }

  if (questions.length === 0) {
    return (
      <div className="min-h-screen bg-cover bg-center flex flex-col items-center justify-center gap-4" style={backgroundStyle}>
        <p className="text-xl text-white">這個主題還沒有 PK 選擇題。</p>
        <button
          type="button"
          onClick={() => navigate('/battle')}
          className="bg-glow text-ink rounded-xl px-6 py-3 font-bold"
        >
          返回主題選擇
        </button>
      </div>
    )
  }

  if (gameEnded) {
    const winner = heartsA === heartsB ? null : heartsA > heartsB ? 'A' : 'B'
    return (
      <div className="min-h-screen bg-cover bg-center flex flex-col items-center justify-center gap-6 text-center px-6" style={backgroundStyle}>
        <h1 className="text-4xl font-extrabold text-white">
          {winner ? `🏆 Player ${winner} 獲勝！` : '⚖️ 平手！'}
        </h1>
        <div className="flex gap-10">
          <HeartDisplay hearts={heartsA} label="Player A" />
          <HeartDisplay hearts={heartsB} label="Player B" />
        </div>
        <div className="flex gap-4">
          <button type="button" onClick={restartGame} className="bg-glow text-ink rounded-xl px-6 py-3 font-bold">
            再來一局
          </button>
          <button
            type="button"
            onClick={() => navigate('/battle')}
            className="text-white border border-white/30 hover:bg-white/10 rounded-xl px-6 py-3 font-bold"
          >
            返回主題選擇
          </button>
        </div>
      </div>
    )
  }

  if (isDesktop) {
    return (
      <div className="h-screen w-screen bg-cover bg-center flex overflow-hidden fixed inset-0" style={backgroundStyle}>
        <RotatedSlot rotate={90}>
          <PlayerPanel
            label="Player A"
            question={current}
            onAnswer={(letter) => handleAnswer('A', letter)}
            locked={lockedA}
            resolved={resolved}
            feedback={feedbackA}
            selected={selectedA}
          />
        </RotatedSlot>

        <ControlBar
          timeLeft={timeLeft}
          heartsA={heartsA}
          heartsB={heartsB}
          hitA={hitA}
          hitB={hitB}
          onNext={nextQuestion}
          onEnd={endGame}
        />

        <RotatedSlot rotate={-90}>
          <PlayerPanel
            label="Player B"
            question={current}
            onAnswer={(letter) => handleAnswer('B', letter)}
            locked={lockedB}
            resolved={resolved}
            feedback={feedbackB}
            selected={selectedB}
          />
        </RotatedSlot>
      </div>
    )
  }

  return (
    <div className="h-screen w-screen bg-cover bg-center flex flex-col overflow-hidden fixed inset-0" style={backgroundStyle}>
      <div className="flex-1 overflow-y-auto flex items-center justify-center py-4">
        <PlayerPanel
          label="Player A"
          question={current}
          onAnswer={(letter) => handleAnswer('A', letter)}
          locked={lockedA}
          resolved={resolved}
          feedback={feedbackA}
          selected={selectedA}
        />
      </div>

      <ControlBar
        horizontal
        timeLeft={timeLeft}
        heartsA={heartsA}
        heartsB={heartsB}
        hitA={hitA}
        hitB={hitB}
        onNext={nextQuestion}
        onEnd={endGame}
      />

      <div className="flex-1 overflow-y-auto flex items-center justify-center py-4" style={{ transform: 'rotate(180deg)' }}>
        <PlayerPanel
          label="Player B"
          question={current}
          onAnswer={(letter) => handleAnswer('B', letter)}
          locked={lockedB}
          resolved={resolved}
          feedback={feedbackB}
          selected={selectedB}
        />
      </div>
    </div>
  )
}
