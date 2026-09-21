import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Layout from '../components/Layout.jsx'
import HintBox, { ExplanationBox } from '../components/HintBox.jsx'
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
      setSelected(null)
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
      <Layout>
        <div className="flex-1 flex items-center justify-center text-xl">載入題目中...</div>
      </Layout>
    )
  }

  if (error) {
    return (
      <Layout>
        <div className="flex-1 flex items-center justify-center text-red-400 text-xl">
          載入失敗：{error}
        </div>
      </Layout>
    )
  }

  if (questions.length === 0) {
    return (
      <Layout>
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <p className="text-xl">這個主題還沒有任務題目。</p>
          <button
            type="button"
            onClick={() => navigate('/task')}
            className="bg-cyan hover:bg-cyan-dark rounded-xl px-6 py-3 font-bold"
          >
            返回主題選擇
          </button>
        </div>
      </Layout>
    )
  }

  if (isFinished) {
    return (
      <Layout>
        <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center px-6">
          <h1 className="text-4xl font-extrabold">🎉 通關成功！</h1>
          <p className="text-lg text-white/80">你已完成「{topic?.name}」的所有任務題目</p>
          <button
            type="button"
            onClick={() => navigate('/task')}
            className="bg-cyan hover:bg-cyan-dark rounded-xl px-8 py-4 text-xl font-bold"
          >
            返回主題選擇
          </button>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="flex-1 px-4 md:px-8 py-8 max-w-2xl mx-auto w-full flex flex-col gap-6">
        <div>
          <div className="flex justify-between text-sm text-white/60 mb-1">
            <span>第 {index + 1} 題 / 共 {questions.length} 題</span>
          </div>
          <div className="w-full bg-white/10 rounded-full h-2">
            <div
              className="bg-cyan h-2 rounded-full transition-all"
              style={{ width: `${((index + 1) / questions.length) * 100}%` }}
            />
          </div>
        </div>

        {topic && (topic.story_context || topic.character_intro) && (
          <div className="bg-navy-light border border-cyan/30 rounded-2xl p-5 shadow-lg">
            {topic.character_intro && (
              <p className="text-cyan font-bold mb-2">{topic.character_intro}</p>
            )}
            {topic.story_context && (
              <p className="text-white/90 leading-relaxed">{topic.story_context}</p>
            )}
          </div>
        )}

        <div className="bg-white/5 rounded-2xl p-6 shadow-lg">
          <p className="text-xl font-bold mb-6">{current.content}</p>

          {status === 'answering' && current.type === 'choice' && (
            <div className="grid grid-cols-1 gap-3">
              {['A', 'B', 'C', 'D'].map((letter) => {
                const text = current[`option_${letter.toLowerCase()}`]
                if (!text) return null
                return (
                  <button
                    key={letter}
                    type="button"
                    onClick={() => handleChoiceAnswer(letter)}
                    className="text-left bg-navy-light hover:bg-cyan/20 border border-white/20 rounded-xl px-5 py-4 text-lg transition-colors"
                  >
                    <span className="font-bold text-cyan mr-2">{letter}.</span>
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
                className="bg-navy-light border border-white/20 rounded-xl px-5 py-4 text-lg text-white outline-none focus:border-cyan"
                placeholder="請輸入答案"
                autoFocus
              />
              <button
                type="submit"
                className="bg-cyan hover:bg-cyan-dark rounded-xl px-6 py-3 text-lg font-bold self-start"
              >
                送出答案
              </button>
            </form>
          )}

          {status === 'answering' && wrongCount > 0 && (
            <div className="mt-5 flex flex-col gap-3">
              <div className="bg-orange-500/90 rounded-xl p-4 text-lg font-bold">
                答錯了，再試一次！
              </div>
              <HintBox text={hintText} />
              {wrongCount >= 3 && (
                <button
                  type="button"
                  onClick={handleGiveUp}
                  className="self-start bg-white/10 hover:bg-white/20 border border-white/30 rounded-xl px-5 py-3 text-base"
                >
                  我真的不會 😭
                </button>
              )}
            </div>
          )}

          {status === 'correct' && (
            <div className="mt-5 flex flex-col gap-4">
              <div className="bg-green-500/90 rounded-xl p-4 text-lg font-bold">
                答對了！🎉
              </div>
              <button
                type="button"
                onClick={resetForNextQuestion}
                className="self-start bg-cyan hover:bg-cyan-dark rounded-xl px-6 py-3 text-lg font-bold"
              >
                繼續下一題
              </button>
            </div>
          )}

          {status === 'gaveUp' && (
            <div className="mt-5 flex flex-col gap-4">
              <ExplanationBox text={current.explanation} answer={current.answer} />
              <button
                type="button"
                onClick={resetForNextQuestion}
                className="self-start bg-cyan hover:bg-cyan-dark rounded-xl px-6 py-3 text-lg font-bold"
              >
                繼續下一題
              </button>
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
