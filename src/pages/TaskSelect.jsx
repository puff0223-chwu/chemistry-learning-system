import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageBackground from '../components/PageBackground.jsx'
import StudentInfoModal from '../components/StudentInfoModal.jsx'
import { getStudentInfo } from '../lib/studentInfo.js'
import { supabase } from '../lib/supabase.js'

export default function TaskSelect() {
  const navigate = useNavigate()
  const [topics, setTopics] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [modal, setModal] = useState(null)
  const [studentInfo, setStudentInfo] = useState(getStudentInfo)

  useEffect(() => {
    let active = true
    supabase
      .from('topics')
      .select('*')
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (!active) return
        if (error) setError(error.message)
        else setTopics(data ?? [])
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  function handleSelectTopic(topicId) {
    if (getStudentInfo()) {
      navigate(`/task/${topicId}`)
    } else {
      setModal({ topicId })
    }
  }

  return (
    <PageBackground page="task">
      <div className="flex-1 px-6 py-10 max-w-4xl mx-auto w-full">
        <div className="flex items-center justify-between mb-8">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="text-white/70 hover:text-white text-sm border border-white/30 rounded-full px-4 py-2 transition-colors"
          >
            ← 返回首頁
          </button>
          <h1 className="text-2xl md:text-3xl font-bold text-white">選擇任務主題</h1>
        </div>

        {studentInfo && (
          <p className="text-sub text-sm mb-4 text-center">
            作答身分：{studentInfo.purpose}・{studentInfo.grade} {studentInfo.className} {studentInfo.seatNumber}號{' '}
            {studentInfo.name}
            <button
              type="button"
              onClick={() => setModal({ topicId: null })}
              className="ml-3 text-xs text-white/50 hover:text-white/80 underline"
            >
              修改資訊
            </button>
          </p>
        )}

        {loading && <p className="text-center text-sub">載入中...</p>}
        {error && <p className="text-center text-badglow">載入失敗：{error}</p>}
        {!loading && !error && topics.length === 0 && (
          <p className="text-center text-sub">目前尚無主題，請聯絡老師新增。</p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {topics.map((topic) => (
            <button
              key={topic.id}
              type="button"
              onClick={() => handleSelectTopic(topic.id)}
              className="glass-card glow-hover text-left rounded-2xl p-6"
              style={{ borderLeft: '4px solid var(--accent)' }}
            >
              <h3 className="text-xl font-bold text-white mb-2">{topic.name}</h3>
              {topic.description && <p className="text-sub text-sm leading-relaxed">{topic.description}</p>}
            </button>
          ))}
        </div>
      </div>

      {modal && (
        <StudentInfoModal
          onClose={() => {
            setModal(null)
            setStudentInfo(getStudentInfo())
          }}
          onSubmit={(info) => {
            const id = modal.topicId
            setModal(null)
            setStudentInfo(info)
            if (id !== null) navigate(`/task/${id}`)
          }}
        />
      )}
    </PageBackground>
  )
}
