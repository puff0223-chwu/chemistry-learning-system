import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import HeartDisplay from '../components/HeartDisplay.jsx'

const QUESTION_SECONDS = 180
const MAX_HEARTS = 10
const BAR_WIDTH = 80
const BG_IMAGE = '/bg-battle.jpg.png'
const OVERLAY = 'rgba(0, 10, 30, 0.8)'
const DIVIDER = 'rgba(255, 255, 255, 0.2)'

const GREEN_STYLE = { background: 'rgba(0, 230, 118, 0.25)', border: '1px solid #00E676' }
const RED_STYLE = { background: 'rgba(255, 82, 82, 0.25)', border: '1px solid #FF5252' }
const AMBER_STYLE = { background: 'rgba(255, 184, 0, 0.2)', border: '1px solid #FFB800' }

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

function formatTime(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

// Each player: unanswered or wrong -> lose 1 heart. Both correct -> only the slower one loses 1.
function computeOutcome(correctAnswer, ansA, ansB) {
  const okA = !!ansA && normalize(ansA.letter) === normalize(correctAnswer)
  const okB = !!ansB && normalize(ansB.letter) === normalize(correctAnswer)
  let lossA = okA ? 0 : 1
  let lossB = okB ? 0 : 1
  let fasterA = false
  let fasterB = false

  if (okA && okB) {
    if (ansA.ts < ansB.ts) {
      lossB = 1
      fasterA = true
    } else if (ansB.ts < ansA.ts) {
      lossA = 1
      fasterB = true
    }
  }

  function describe(ans, ok, lost, faster, opponentOk) {
    if (ok && opponentOk) {
      if (lost) return { kind: 'warn', text: '兩人都答對，你較慢 -1 血' }
      return { kind: 'good', text: faster ? '答對了，你比較快！' : '答對了！' }
    }
    if (ok) return { kind: 'good', text: '答對了！' }
    if (ans) return { kind: 'bad', text: '答錯了 -1 血' }
    return { kind: 'bad', text: '時間到，未作答 -1 血' }
  }

  return {
    lossA,
    lossB,
    resultA: describe(ansA, okA, lossA > 0, fasterA, okB),
    resultB: describe(ansB, okB, lossB > 0, fasterB, okA),
  }
}

function useIsWide() {
  const [isWide, setIsWide] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 600px)').matches,
  )
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 600px)')
    const handler = (e) => setIsWide(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])
  return isWide
}

function RotatedFrame({ rotate, width, height, slotStyle, children }) {
  return (
    <div style={{ position: 'relative', overflow: 'hidden', flexShrink: 0, ...slotStyle }}>
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width,
          height,
          transform: `translate(-50%, -50%) rotate(${rotate}deg)`,
        }}
      >
        {children}
      </div>
    </div>
  )
}

function ControlButtons({ onNext, onEnd }) {
  return (
    <div className="flex items-center justify-center gap-3 w-full h-full">
      <button type="button" onClick={onNext} className="bg-glow text-ink rounded-lg px-4 py-2 text-lg font-bold">
        ▶ 下一題
      </button>
      <button
        type="button"
        onClick={onEnd}
        className="text-white/70 hover:text-white border border-white/30 rounded-lg px-4 py-2 text-lg"
      >
        🏳 結束
      </button>
    </div>
  )
}

function PlayerArea({ side, question, timeLeft, hearts, answer, phase, result, onAnswer, controls }) {
  const revealed = phase === 'revealed'
  const urgent = timeLeft <= 30
  const bannerStyle = result?.kind === 'good' ? GREEN_STYLE : result?.kind === 'warn' ? AMBER_STYLE : RED_STYLE

  return (
    <div className="w-full h-full flex flex-col gap-2 p-3 text-white">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-glow font-extrabold text-xl">{side}</span>
          <HeartDisplay hearts={hearts} max={MAX_HEARTS} />
        </div>
        <span
          className={`text-3xl font-extrabold tabular-nums ${urgent ? 'text-badglow animate-pulse' : 'text-white'}`}
        >
          {formatTime(timeLeft)}
        </span>
      </div>

      <p className="text-xl font-bold text-center leading-snug">{question.content}</p>

      <div
        className="rounded-lg px-3 py-1 text-center font-bold text-lg"
        style={revealed && result ? bannerStyle : { visibility: 'hidden' }}
      >
        {revealed && result ? result.text : '　'}
      </div>

      <div className="grid grid-cols-2 gap-3 flex-1 min-h-0">
        {['A', 'B', 'C', 'D'].map((letter) => {
          const text = question[`option_${letter.toLowerCase()}`]
          if (!text) return null
          const chosen = answer?.letter === letter
          const isCorrectOption = revealed && normalize(letter) === normalize(question.answer)
          const isWrongChoice = revealed && chosen && !isCorrectOption
          const disabled = revealed || !!answer

          let style = {}
          let cls = 'text-white'
          if (isCorrectOption) style = GREEN_STYLE
          else if (isWrongChoice) style = RED_STYLE
          else if (!revealed && chosen) cls += ' glass-card opacity-60'
          else if (disabled) cls += ' glass-card opacity-40'
          else cls += ' glass-card glow-hover'

          return (
            <button
              key={letter}
              type="button"
              disabled={disabled}
              onClick={() => onAnswer(letter)}
              className={`flex items-center gap-2 text-left rounded-xl px-4 py-2 text-lg ${cls}`}
              style={style}
            >
              <span className="font-bold text-glow">{letter}.</span>
              <span className="flex-1">{text}</span>
              {!revealed && chosen && <span className="text-white/60">✓</span>}
            </button>
          )
        })}
      </div>

      {controls && (
        <div style={{ height: 44 }}>
          <ControlButtons onNext={controls.onNext} onEnd={controls.onEnd} />
        </div>
      )}
    </div>
  )
}

function EndOverlay({ heartsA, heartsB, onRestart, onExit }) {
  const winner = heartsA === heartsB ? null : heartsA > heartsB ? 'A' : 'B'
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 text-center px-6"
      style={{ background: 'rgba(0, 10, 30, 0.92)' }}
    >
      <h1 className="text-4xl font-extrabold text-white">
        {winner ? `🏆 Player ${winner} 獲勝！` : '⚖️ 平手！'}
      </h1>
      <div className="flex flex-col gap-3 items-center text-white">
        <div className="flex items-center gap-3">
          <span className="font-bold text-glow text-xl">Player A</span>
          <HeartDisplay hearts={heartsA} max={MAX_HEARTS} />
        </div>
        <div className="flex items-center gap-3">
          <span className="font-bold text-glow text-xl">Player B</span>
          <HeartDisplay hearts={heartsB} max={MAX_HEARTS} />
        </div>
      </div>
      <div className="flex gap-4">
        <button type="button" onClick={onRestart} className="bg-glow text-ink rounded-xl px-6 py-3 text-lg font-bold">
          再來一局
        </button>
        <button
          type="button"
          onClick={onExit}
          className="text-white border border-white/30 hover:bg-white/10 rounded-xl px-6 py-3 text-lg font-bold"
        >
          返回選擇
        </button>
      </div>
    </div>
  )
}

export default function BattlePlay() {
  const { topicId } = useParams()
  const navigate = useNavigate()
  const isWide = useIsWide()

  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [qIndex, setQIndex] = useState(0)
  const [heartsA, setHeartsA] = useState(MAX_HEARTS)
  const [heartsB, setHeartsB] = useState(MAX_HEARTS)
  const [answerA, setAnswerA] = useState(null)
  const [answerB, setAnswerB] = useState(null)
  const [phase, setPhase] = useState('answering') // answering | revealed
  const [outcome, setOutcome] = useState(null)
  const [timeLeft, setTimeLeft] = useState(QUESTION_SECONDS)
  const [gameEnded, setGameEnded] = useState(false)

  useEffect(() => {
    let active = true
    async function load() {
      const { data, error: err } = await supabase
        .from('questions')
        .select('*')
        .eq('topic_id', topicId)
        .in('mode', ['pk', 'both'])
        .eq('type', 'choice')
      if (!active) return
      if (err) setError(err.message)
      else setQuestions(shuffle(data ?? []))
      setLoading(false)
    }
    load()
    return () => {
      active = false
    }
  }, [topicId])

  const current = questions.length > 0 ? questions[qIndex % questions.length] : null

  function settle(ansA, ansB) {
    const result = computeOutcome(current.answer, ansA, ansB)
    setOutcome(result)
    setPhase('revealed')
    setHeartsA((h) => Math.max(0, h - result.lossA))
    setHeartsB((h) => Math.max(0, h - result.lossB))
  }

  useEffect(() => {
    if (gameEnded || phase !== 'answering' || !current) return
    if (timeLeft <= 0) {
      settle(answerA, answerB)
      return
    }
    const timer = setTimeout(() => setTimeLeft((t) => t - 1), 1000)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, phase, gameEnded, current])

  useEffect(() => {
    if (gameEnded || (heartsA > 0 && heartsB > 0)) return
    const t = setTimeout(() => setGameEnded(true), 1000)
    return () => clearTimeout(t)
  }, [heartsA, heartsB, gameEnded])

  function handleAnswer(player, letter) {
    if (!current || gameEnded || phase !== 'answering') return
    if ((player === 'A' ? answerA : answerB) !== null) return
    const record = { letter, ts: performance.now() }
    const nextA = player === 'A' ? record : answerA
    const nextB = player === 'B' ? record : answerB
    if (player === 'A') setAnswerA(record)
    else setAnswerB(record)
    if (nextA && nextB) settle(nextA, nextB)
  }

  function nextQuestion() {
    if (gameEnded || heartsA <= 0 || heartsB <= 0) return
    setQIndex((i) => i + 1)
    setAnswerA(null)
    setAnswerB(null)
    setOutcome(null)
    setPhase('answering')
    setTimeLeft(QUESTION_SECONDS)
  }

  function restartGame() {
    setQuestions((qs) => shuffle(qs))
    setQIndex(0)
    setHeartsA(MAX_HEARTS)
    setHeartsB(MAX_HEARTS)
    setAnswerA(null)
    setAnswerB(null)
    setOutcome(null)
    setPhase('answering')
    setTimeLeft(QUESTION_SECONDS)
    setGameEnded(false)
  }

  const endGame = () => setGameEnded(true)
  const exit = () => navigate('/battle')
  const backgroundStyle = { backgroundImage: `linear-gradient(${OVERLAY}, ${OVERLAY}), url(${BG_IMAGE})` }

  if (loading || error || questions.length === 0) {
    return (
      <div
        className="min-h-screen bg-cover bg-center flex flex-col items-center justify-center gap-4 text-xl text-white"
        style={backgroundStyle}
      >
        {loading && <p>載入題目中...</p>}
        {error && <p className="text-badglow">載入失敗：{error}</p>}
        {!loading && !error && (
          <>
            <p>這個主題還沒有 PK 選擇題。</p>
            <button type="button" onClick={exit} className="bg-glow text-ink rounded-xl px-6 py-3 font-bold">
              返回選擇
            </button>
          </>
        )}
      </div>
    )
  }

  const areaProps = { question: current, timeLeft, phase }
  const areaA = {
    ...areaProps,
    side: 'A',
    hearts: heartsA,
    answer: answerA,
    result: outcome?.resultA,
    onAnswer: (letter) => handleAnswer('A', letter),
  }
  const areaB = {
    ...areaProps,
    side: 'B',
    hearts: heartsB,
    answer: answerB,
    result: outcome?.resultB,
    onAnswer: (letter) => handleAnswer('B', letter),
  }
  const overlay = gameEnded && (
    <EndOverlay heartsA={heartsA} heartsB={heartsB} onRestart={restartGame} onExit={exit} />
  )

  if (isWide) {
    const slotWidth = `calc((100vw - ${BAR_WIDTH}px) / 2)`
    const barSection = { width: BAR_WIDTH, height: '40vh' }
    return (
      <div className="fixed inset-0 flex overflow-hidden bg-cover bg-center" style={backgroundStyle}>
        <RotatedFrame rotate={90} width="100vh" height={slotWidth} slotStyle={{ width: slotWidth, height: '100vh' }}>
          <PlayerArea {...areaA} />
        </RotatedFrame>

        <div
          className="flex flex-col justify-between shrink-0"
          style={{
            width: BAR_WIDTH,
            height: '100vh',
            background: 'rgba(0, 10, 30, 0.9)',
            borderLeft: `1px solid ${DIVIDER}`,
            borderRight: `1px solid ${DIVIDER}`,
          }}
        >
          <RotatedFrame rotate={90} width="40vh" height={BAR_WIDTH} slotStyle={barSection}>
            <ControlButtons onNext={nextQuestion} onEnd={endGame} />
          </RotatedFrame>
          <RotatedFrame rotate={-90} width="40vh" height={BAR_WIDTH} slotStyle={barSection}>
            <ControlButtons onNext={nextQuestion} onEnd={endGame} />
          </RotatedFrame>
        </div>

        <RotatedFrame rotate={-90} width="100vh" height={slotWidth} slotStyle={{ width: slotWidth, height: '100vh' }}>
          <PlayerArea {...areaB} />
        </RotatedFrame>
        {overlay}
      </div>
    )
  }

  const controls = { onNext: nextQuestion, onEnd: endGame }
  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-cover bg-center" style={backgroundStyle}>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <PlayerArea {...areaA} controls={controls} />
      </div>
      <div style={{ height: 1, background: DIVIDER, flexShrink: 0 }} />
      <div className="flex-1 min-h-0 overflow-y-auto" style={{ transform: 'rotate(180deg)' }}>
        <PlayerArea {...areaB} controls={controls} />
      </div>
      {overlay}
    </div>
  )
}
