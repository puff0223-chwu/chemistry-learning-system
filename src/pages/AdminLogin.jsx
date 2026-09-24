import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminSignIn, getAdminSession, DEFAULT_ADMIN_EMAIL } from '../lib/supabase.js'

export default function AdminLogin() {
  const navigate = useNavigate()
  const [email, setEmail] = useState(DEFAULT_ADMIN_EMAIL)
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    getAdminSession().then((session) => {
      if (session) navigate('/admin/topics')
    })
  }, [navigate])

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await adminSignIn(email, password)
      navigate('/admin/topics')
    } catch {
      setError('帳號或密碼錯誤，請再試一次')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 page-fade" style={{ background: '#0a0e1a' }}>
      <form onSubmit={handleSubmit} className="glass-card w-full max-w-sm rounded-2xl p-8 flex flex-col gap-5 shadow-2xl">
        <h1 className="text-2xl font-bold text-center text-white">🔬 教師後台</h1>
        <label className="flex flex-col gap-1 text-sm text-sub">
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="請輸入 Email"
            className="glass-input rounded-xl px-4 py-3 text-lg outline-none focus:border-glow"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-sub">
          密碼
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="請輸入密碼"
            className="glass-input rounded-xl px-4 py-3 text-lg outline-none focus:border-glow"
            autoFocus
          />
        </label>
        {error && <p className="text-badglow text-sm text-center">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="bg-glow text-ink disabled:opacity-50 rounded-xl px-4 py-3 text-lg font-bold"
        >
          {loading ? '登入中...' : '登入'}
        </button>
        <button type="button" onClick={() => navigate('/')} className="text-white/50 hover:text-white text-sm">
          返回首頁
        </button>
      </form>
    </div>
  )
}
