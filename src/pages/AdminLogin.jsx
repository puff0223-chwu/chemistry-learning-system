import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminSignIn, getAdminSession } from '../lib/supabase.js'

export default function AdminLogin() {
  const navigate = useNavigate()
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
      await adminSignIn(password)
      navigate('/admin/topics')
    } catch (err) {
      setError('密碼錯誤或登入失敗，請再試一次')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-navy text-white flex items-center justify-center px-6">
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-navy-light rounded-2xl p-8 shadow-xl flex flex-col gap-5">
        <h1 className="text-2xl font-bold text-center">🔐 老師後台登入</h1>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="請輸入密碼"
          className="bg-navy border border-white/20 rounded-xl px-4 py-3 text-lg outline-none focus:border-cyan"
          autoFocus
        />
        {error && <p className="text-red-400 text-sm text-center">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="bg-cyan hover:bg-cyan-dark disabled:opacity-50 rounded-xl px-4 py-3 text-lg font-bold"
        >
          {loading ? '登入中...' : '登入'}
        </button>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="text-white/50 hover:text-white text-sm"
        >
          返回首頁
        </button>
      </form>
    </div>
  )
}
