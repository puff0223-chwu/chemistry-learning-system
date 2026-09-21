import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import HeartDisplay from '../components/HeartDisplay.jsx'

const QUESTION_SECONDS = 180
const MAX_HEARTS = 10

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

const rotatedSlotStyle = {
  position: 'relative',
  overflow: 'hidden',
  height: '100vh',
  width: 'calc((100vw - 84px) / 2)',
  flexShrink: 0,
}

function RotatedPanel({ rotate, children }) {
  return (
    <div style={rotatedSlotStyle}>
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

function PlayerPanel({ label, question, onAnswer, locked, resolved, feedback }) {
  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-[80vh]">
      <h2 className="text-xl font-bold text-cyan">{label}</h2>
      {question ? (
        <>
          <p className="text-lg font-bold text-center leading-snug">{question.content}</p>
          <div className="grid grid-cols-1 gap-2 w-full">
            {['A', 'B', 'C', 'D'].map((letter) => {
              const text = question[`option_${letter.toLowerCase()}`]
              if (!text) return null
              return (
                <button
                  key={letter}
                  type="button"
                  disabled={locked || resolved}
                  onClick={() => onAnswer(letter)}
                  className="text-left bg-navy-light hover:bg-cyan/20 disabled:opacity-40 border border-white/20 rounded-lg px-4 py-3 text-base transition-colors"
                >
                  <span className="font-bold text-cyan mr-2">{letter}.</span>
                  {text}
                </button>
              )
            })}
          </div>
          {feedback && (
            <div
              className={`w-full text-center rounded-lg px-3 py-2 font-bold ${
                feedback.type === 'good' ? 'bg-green-500/90' : 'bg-orange-500/90'
              }`}
            >
              {feedback.text}
            </div>
          )}
        </>
      ) : (
        <p className="text-white/60">沒有可用的 PK 題目</p>
      )}
    </div>
  )
}

export default function BattlePlay() {
  const { topicId } = useParams()
  const navigate = useNavigate()

  const [topic, setTopic] = useState(null)
  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [qIndex, setQIndex] = useState(0)
  const [heartsA, setHeartsA] = useState(MAX_HEARTS)
  const [heartsB, setHeartsB] = useState(MAX_HEARTS)
  const [lockedA, setLockedA] = useState(false)
  const [lockedB, setLockedB] = useState(false)
  const [resolved, setResolved] = useState(false)
  const [feedbackA, setFeedbackA] = useState(null)
  const [feedbackB, setFeedbackB] = useState(null)
  const [timeLeft, setTimeLeft] = useState(QUESTION_SECONDS)
  const [gameEnded, setGameEnded] = useState(false)

  useEffect(() => {
    let active = true
    async function load() {
      const [{ data: topicData, error: topicError }, { data: questionData, error: questionError }] =
        await Promise.all([
          supabase.from('topics').select('*').eq('id', topicId).single(),
          supabase
            .from('questions')
            .select('*')
            .eq('topic_id', topicId)
            .in('mode', ['pk', 'both'])
            .eq('type', 'choice'),
        ])
      if (!active) return
      if (topicError) setError(topicError.message)
      else setTopic(topicData)
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
      const messages = []
      if (!lockedA) {
        setHeartsA((h) => Math.max(0, h - 1))
        setFeedbackA({ type: 'bad', text: '時間到，未作答 -1 血' })
        messages.push('A')
      }
      if (!lockedB) {
        setHeartsB((h) => Math.max(0, h - 1))
        setFeedbackB({ type: 'bad', text: '時間到，未作答 -1 血' })
        messages.push('B')
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
    setResolved(false)
    setFeedbackA(null)
    setFeedbackB(null)
    setTimeLeft(QUESTION_SECONDS)
    setGameEnded(false)
    setEndReason(null)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-navy text-white flex items-center justify-center text-xl">
        載入題目中...
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-navy text-white flex items-center justify-center text-red-400 text-xl">
        載入失敗：{error}
      </div>
    )
  }

  if (questions.length === 0) {
    return (
      <div className="min-h-screen bg-navy text-white flex flex-col items-center justify-center gap-4">
        <p className="text-xl">這個主題還沒有 PK 選擇題。</p>
        <button
          type="button"
          onClick={() => navigate('/battle')}
          className="bg-cyan hover:bg-cyan-dark rounded-xl px-6 py-3 font-bold"
        >
          返回主題選擇
        </button>
      </div>
    )
  }

  if (gameEnded) {
    const winner = heartsA === heartsB ? null : heartsA > heartsB ? 'A' : 'B'
    return (
      <div className="min-h-screen bg-navy text-white flex flex-col items-center justify-center gap-6 text-center px-6">
        <h1 className="text-4xl font-extrabold">
          {winner ? `🏆 Player ${winner} 獲勝！` : '⚖️ 平手！'}
        </h1>
        <div className="flex gap-10">
          <HeartDisplay hearts={heartsA} label="Player A" />
          <HeartDisplay hearts={heartsB} label="Player B" />
        </div>
        <div className="flex gap-4">
          <button
            type="button"
            onClick={restartGame}
            className="bg-cyan hover:bg-cyan-dark rounded-xl px-6 py-3 font-bold"
          >
            再來一局
          </button>
          <button
            type="button"
            onClick={() => navigate('/battle')}
            className="bg-white/10 hover:bg-white/20 border border-white/30 rounded-xl px-6 py-3 font-bold"
          >
            返回主題選擇
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen w-screen bg-navy text-white flex overflow-hidden fixed inset-0">
      <RotatedPanel rotate={90}>
        <PlayerPanel
          label="Player A"
          question={current}
          onAnswer={(letter) => handleAnswer('A', letter)}
          locked={lockedA}
          resolved={resolved}
          feedback={feedbackA}
        />
      </RotatedPanel>

      <div className="flex flex-col items-center justify-between py-4 gap-3" style={{ width: '84px', flexShrink: 0 }}>
        <div className={`text-lg font-extrabold ${timeLeft <= 30 ? 'text-red-500' : 'text-white'}`}>
          {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
        </div>
        <HeartDisplay hearts={heartsA} label="A" />
        <HeartDisplay hearts={heartsB} label="B" />
        <button
          type="button"
          onClick={nextQuestion}
          className="bg-cyan hover:bg-cyan-dark rounded-lg px-2 py-3 text-xs font-bold writing-vertical"
          style={{ writingMode: 'vertical-rl' }}
        >
          ▶ 下一題
        </button>
        <button
          type="button"
          onClick={() => endGame()}
          className="bg-white/10 hover:bg-white/20 border border-white/30 rounded-lg px-2 py-3 text-xs"
          style={{ writingMode: 'vertical-rl' }}
        >
          🏳 結束比賽
        </button>
      </div>

      <RotatedPanel rotate={-90}>
        <PlayerPanel
          label="Player B"
          question={current}
          onAnswer={(letter) => handleAnswer('B', letter)}
          locked={lockedB}
          resolved={resolved}
          feedback={feedbackB}
        />
      </RotatedPanel>
    </div>
  )
}
