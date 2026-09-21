import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout.jsx'
import TopicCard from '../components/TopicCard.jsx'
import { supabase } from '../lib/supabase.js'

export default function BattleSelect() {
  const navigate = useNavigate()
  const [topics, setTopics] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

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

  return (
    <Layout>
      <div className="flex-1 px-6 py-10 max-w-3xl mx-auto w-full">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="text-white/60 hover:text-white mb-6"
        >
          ← 返回首頁
        </button>
        <h1 className="text-3xl font-bold mb-8 text-center">⚔️ 選擇對戰主題</h1>

        {loading && <p className="text-center text-white/60">載入中...</p>}
        {error && <p className="text-center text-red-400">載入失敗：{error}</p>}
        {!loading && !error && topics.length === 0 && (
          <p className="text-center text-white/60">目前尚無主題，請聯絡老師新增。</p>
        )}

        <div className="flex flex-col gap-4">
          {topics.map((topic) => (
            <TopicCard key={topic.id} topic={topic} onClick={() => navigate(`/battle/${topic.id}`)} />
          ))}
        </div>
      </div>
    </Layout>
  )
}
