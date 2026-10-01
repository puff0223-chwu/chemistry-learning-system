import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageBackground from '../components/PageBackground.jsx'
import { fetchCategories, fetchPublishedMissions } from '../lib/missions.js'

// Student mission list (/missions): only published AND open missions are returned by the database.
export default function MissionSelect() {
  const navigate = useNavigate()
  const [missions, setMissions] = useState([])
  const [categories, setCategories] = useState([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    Promise.all([fetchPublishedMissions(), fetchCategories()])
      .then(([m, c]) => {
        if (!active) return
        setMissions(m)
        setCategories(c)
      })
      .catch((err) => active && setError(err.message))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  const categoryName = (id) => categories.find((c) => c.id === id)?.name
  // Only offer filter chips for categories that actually have a mission.
  const usedCategories = categories.filter((c) => missions.some((m) => m.category_id === c.id))
  const visible = filter === 'all' ? missions : missions.filter((m) => m.category_id === Number(filter))

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
          <h1 className="text-2xl md:text-3xl font-bold text-white">選擇任務</h1>
        </div>

        {usedCategories.length > 1 && (
          <div className="flex flex-wrap justify-center gap-2 mb-6">
            {[{ id: 'all', name: '全部' }, ...usedCategories].map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setFilter(String(c.id))}
                className={`rounded-full px-4 py-1.5 text-sm border transition-colors ${
                  filter === String(c.id)
                    ? 'bg-white/20 border-white/70 text-white font-bold'
                    : 'border-white/30 text-white/70 hover:bg-white/10'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}

        {loading && <p className="text-center text-sub">載入中...</p>}
        {error && <p className="text-center text-badglow">載入失敗：{error}</p>}
        {!loading && !error && visible.length === 0 && (
          <p className="text-center text-sub">目前沒有開放的任務，請等老師開放。</p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {visible.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => navigate(`/mission/${m.id}`)}
              className="glass-card glow-hover rounded-2xl overflow-hidden text-left"
              style={{ borderLeft: '4px solid var(--accent)' }}
            >
              {m.cover_url && <img src={m.cover_url} alt="" className="w-full h-36 object-cover" loading="lazy" />}
              <div className="p-6">
                <h3 className="text-xl font-bold text-white mb-1">{m.title}</h3>
                {categoryName(m.category_id) && <p className="text-sub text-sm">{categoryName(m.category_id)}</p>}
              </div>
            </button>
          ))}
        </div>

        <div className="mt-10 text-center">
          <button
            type="button"
            onClick={() => navigate('/task')}
            className="text-xs text-white/50 hover:text-white/80 underline"
          >
            舊版任務闖關（依題庫出題）
          </button>
        </div>
      </div>
    </PageBackground>
  )
}
