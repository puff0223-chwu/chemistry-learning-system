import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import PageBackground from '../components/PageBackground.jsx'
import { supabase } from '../lib/supabase.js'

function normalize(str) {
  return (str ?? '').trim().toLowerCase()
}

export default function TaskPlay() {
  const { topicId } = useParams()
  const navigate = useNavigate()

  const [topic, setTopic] = useState(null)
  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [index, setIndex] = useState(0)
  const [wrongCount, setWrongCount] = useState(0)
  const [status, setStatus] = useState('answering') // answering | correct | gaveUp
  const [fillValue, setFillValue] = useState('')
  const [selected, setSelected] = useState(null)

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
            .in('mode', ['task', 'both'])
            .order('id', { ascending: true }),
        ])
      if (!active) return
      if (topicError) setError(topicError.message)
      else setTopic(topicData)
      if (questionError) setError(questionError.message)
      else setQuestions(questionData ?? [])
      setLoading(false)
    }
    load()
    return () => {
      active = false
    }
  }, [topicId])

  const current = questions[index]
  const isFinished = !loading && questions.length > 0 && index >= questions.length

  const hintText = useMemo(() => {
    if (!current) return null
    if (wrongCount === 1) return current.hint_1
    if (wrongCount === 2) return current.hint_2
    if (wrongCount >= 3) return current.hint_3
    return null
  }, [current, wrongCount])

  function resetForNextQuestion() {
    setIndex((i) => i + 1)
    setWrongCount(0)
    setStatus('answering')
    setFillValue('')
    setSelected(null)
  }

  function handleChoiceAnswer(letter) {
    if (status !== 'answering') return
    setSelected(letter)
    if (normalize(letter) === normalize(current.answer)) {
      setStatus('correct')
    } else {
      setWrongCount((c) => c + 1)
    }
  }

  function handleFillSubmit(e) {
    e.preventDefault()
    if (status !== 'answering') return
    if (normalize(fillValue) === normalize(current.answer)) {
      setStatus('correct')
    } else {
      setWrongCount((c) => c + 1)
    }
  }

  function handleGiveUp() {
    setStatus('gaveUp')
  }

  if (loading) {
    return (
      <PageBackground image="/bg-task.jpg.png">
        <div className="flex-1 flex items-center justify-center text-xl text-white">載入題目中...</div>
      </PageBackground>
    )
  }

  if (error) {
    return (
      <PageBackground image="/bg-task.jpg.png">
        <div className="flex-1 flex items-center justify-center text-badglow text-xl">載入失敗：{error}</div>
      </PageBackground>
    )
  }

  if (questions.length === 0) {
    return (
      <PageBackground image="/bg-task.jpg.png">
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <p className="text-xl text-white">這個主題還沒有任務題目。</p>
          <button
            type="button"
            onClick={() => navigate('/task')}
            className="bg-glow text-ink rounded-xl px-6 py-3 font-bold"
          >
            返回主題選擇
          </button>
        </div>
      </PageBackground>
    )
  }

  if (isFinished) {
    return (
      <PageBackground image="/bg-task.jpg.png">
        <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center px-6">
          <h1 className="text-4xl font-extrabold text-white">🎉 通關成功！</h1>
          <p className="text-lg text-sub">你已完成「{topic?.name}」的所有任務題目</p>
          <button
            type="button"
            onClick={() => navigate('/task')}
            className="bg-glow text-ink rounded-xl px-8 py-4 text-xl font-bold"
          >
            返回主題選擇
          </button>
        </div>
      </PageBackground>
    )
  }

  return (
    <PageBackground image="/bg-task.jpg.png">
      <div className="flex-1 px-4 md:px-8 py-8 max-w-2xl mx-auto w-full flex flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => navigate('/task')}
            className="text-white/70 hover:text-white text-sm border border-white/30 rounded-full px-4 py-2 shrink-0 transition-colors"
          >
            ← 返回
          </button>
          <div className="flex-1">
            <div className="flex justify-between text-sm text-sub mb-1">
              <span>第 {index + 1} 題 / 共 {questions.length} 題</span>
            </div>
            <div className="w-full bg-white/10 rounded-full h-2">
              <div
                className="bg-glow h-2 rounded-full transition-all"
                style={{ width: `${((index + 1) / questions.length) * 100}%` }}
              />
            </div>
          </div>
          <span className="text-white text-sm font-bold shrink-0 hidden md:block">{topic?.name}</span>
        </div>

        {topic && (topic.story_context || topic.character_intro) && (
          <div className="glass-card rounded-2xl p-5" style={{ borderLeft: '4px solid #00D4FF' }}>
            <p className="text-xs font-bold text-glow mb-2">📋 案件情境</p>
            {topic.character_intro && <p className="text-white font-bold mb-2">{topic.character_intro}</p>}
            {topic.story_context && <p className="text-sub leading-relaxed">{topic.story_context}</p>}
          </div>
        )}

        <div className="glass-card rounded-2xl p-6">
          <p className="text-xs font-bold text-glow mb-2">❓ 題目</p>
          <p className="text-xl font-bold text-white mb-6">{current.content}</p>

          {status !== 'gaveUp' && current.type === 'choice' && (
            <div className="grid grid-cols-1 gap-3">
              {['A', 'B', 'C', 'D'].map((letter) => {
                const text = current[`option_${letter.toLowerCase()}`]
                if (!text) return null
                const isCorrectPick = status === 'correct' && selected === letter
                const isWrongPick = status === 'answering' && selected === letter && wrongCount > 0
                let stateClasses = 'glass-card glow-hover text-white'
                let stateStyle = {}
                if (isCorrectPick) {
                  stateClasses = 'text-white'
                  stateStyle = { background: 'rgba(0, 230, 118, 0.25)', border: '1px solid #00E676' }
                } else if (isWrongPick) {
                  stateClasses = 'text-white'
                  stateStyle = { background: 'rgba(255, 82, 82, 0.25)', border: '1px solid #FF5252' }
                }
                return (
                  <button
                    key={letter}
                    type="button"
                    disabled={status !== 'answering'}
                    onClick={() => handleChoiceAnswer(letter)}
                    className={`text-left rounded-xl px-5 py-4 text-lg transition-colors ${stateClasses}`}
                    style={stateStyle}
                  >
                    <span className="font-bold text-glow mr-2">{letter}.</span>
                    {text}
                  </button>
                )
              })}
            </div>
          )}

          {status === 'answering' && current.type === 'fill' && (
            <form onSubmit={handleFillSubmit} className="flex flex-col gap-4">
              <input
                type="text"
                value={fillValue}
                onChange={(e) => setFillValue(e.target.value)}
                className="glass-input rounded-xl px-5 py-4 text-lg outline-none focus:border-glow"
                placeholder="請輸入答案"
                autoFocus
              />
              <button
                type="submit"
                className="bg-glow text-ink rounded-xl px-6 py-3 text-lg font-bold self-start"
              >
                送出答案
              </button>
            </form>
          )}

          {status === 'answering' && wrongCount > 0 && (
            <div className="mt-5 flex flex-col gap-3">
              {current.type === 'fill' && (
                <div
                  className="rounded-xl p-4 text-lg font-bold text-white"
                  style={{ background: 'rgba(255, 82, 82, 0.25)', border: '1px solid #FF5252' }}
                >
                  答錯了，再試一次！
                </div>
              )}
              {hintText && (
                <div
                  className="rounded-xl p-4 flex items-start gap-3"
                  style={{ background: 'rgba(255, 184, 0, 0.18)', border: '1px solid rgba(255, 184, 0, 0.5)' }}
                >
                  <span className="text-2xl leading-none">💡</span>
                  <div>
                    <p className="text-xs font-bold text-warnglow mb-1">提示</p>
                    <p className="text-white leading-relaxed">{hintText}</p>
                  </div>
                </div>
              )}
              {wrongCount >= 3 && (
                <button
                  type="button"
                  onClick={handleGiveUp}
                  className="self-start text-white/60 hover:text-white/90 text-sm underline"
                >
                  我真的不會 😭
                </button>
              )}
            </div>
          )}

          {status === 'correct' && (
            <div className="mt-5 flex flex-col gap-4">
              <div
                className="rounded-xl p-4 text-lg font-bold text-white"
                style={{ background: 'rgba(0, 230, 118, 0.2)', border: '1px solid #00E676' }}
              >
                答對了！🎉
              </div>
              <button
                type="button"
                onClick={resetForNextQuestion}
                className="self-start bg-glow text-ink rounded-xl px-6 py-3 text-lg font-bold"
              >
                繼續下一題
              </button>
            </div>
          )}

          {status === 'gaveUp' && (
            <div className="mt-5 flex flex-col gap-4">
              <div
                className="rounded-xl p-4 flex items-start gap-3"
                style={{ background: 'rgba(30, 58, 95, 0.6)', border: '1px solid rgba(184, 201, 224, 0.4)' }}
              >
                <span className="text-2xl leading-none">📖</span>
                <div className="text-white leading-relaxed">
                  <p className="font-bold mb-1">正確答案：{current.answer}</p>
                  {current.explanation && <p>{current.explanation}</p>}
                </div>
              </div>
              <button
                type="button"
                onClick={resetForNextQuestion}
                className="self-start bg-glow text-ink rounded-xl px-6 py-3 text-lg font-bold"
              >
                繼續下一題
              </button>
            </div>
          )}
        </div>
      </div>
    </PageBackground>
  )
}
