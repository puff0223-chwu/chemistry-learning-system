import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminSignIn, getAdminSession, DEFAULT_ADMIN_EMAIL, RESET_PASSWORD_URL, supabase } from '../lib/supabase.js'

export default function AdminLogin() {
  const navigate = useNavigate()
  const [mode, setMode] = useState('login') // login | reset
  const [email, setEmail] = useState(DEFAULT_ADMIN_EMAIL)
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetState, setResetState] = useState({ status: 'idle', text: '' }) // idle | sending | sent | failed

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

  function openReset() {
    setResetEmail(email)
    setResetState({ status: 'idle', text: '' })
    setMode('reset')
  }

  // Supabase answers the same way whether or not the address has an account, so this message never
  // reveals which emails exist. Only genuine failures (rate limit, network) are reported.
  async function handleReset(e) {
    e.preventDefault()
    setResetState({ status: 'sending', text: '' })
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), { redirectTo: RESET_PASSWORD_URL })
      if (err) throw err
      setResetState({ status: 'sent', text: '重設信已寄出，請至信箱查看' })
    } catch (err) {
      setResetState({ status: 'failed', text: `寄送失敗：${err.message ?? '請稍後再試'}` })
    }
  }

  const input = 'glass-input rounded-xl px-4 py-3 text-lg outline-none focus:border-glow'

  return (
    <div className="min-h-screen flex items-center justify-center px-6 page-fade" style={{ background: '#0a0e1a' }}>
      {mode === 'login' ? (
        <form onSubmit={handleSubmit} className="glass-card w-full max-w-sm rounded-2xl p-8 flex flex-col gap-5 shadow-2xl">
          <h1 className="text-2xl font-bold text-center text-white">🔬 教師後台</h1>
          <label className="flex flex-col gap-1 text-sm text-sub">
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="請輸入 Email" className={input} />
          </label>
          <label className="flex flex-col gap-1 text-sm text-sub">
            密碼
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="請輸入密碼"
              className={input}
              autoFocus
            />
            <button type="button" onClick={openReset} className="self-end text-xs text-white/60 hover:text-white underline mt-1">
              忘記密碼？
            </button>
          </label>
          {error && <p className="text-badglow text-sm text-center">{error}</p>}
          <button type="submit" disabled={loading} className="bg-glow text-ink disabled:opacity-50 rounded-xl px-4 py-3 text-lg font-bold">
            {loading ? '登入中...' : '登入'}
          </button>
          <button type="button" onClick={() => navigate('/')} className="text-white/50 hover:text-white text-sm">
            返回首頁
          </button>
        </form>
      ) : (
        <form onSubmit={handleReset} className="glass-card w-full max-w-sm rounded-2xl p-8 flex flex-col gap-5 shadow-2xl">
          <h1 className="text-2xl font-bold text-center text-white">忘記密碼</h1>
          <p className="text-sub text-sm text-center">輸入帳號的 Email，我們會寄一封重設密碼的信給你。</p>
          <label className="flex flex-col gap-1 text-sm text-sub">
            Email
            <input value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} placeholder="請輸入 Email" className={input} autoFocus />
          </label>
          {resetState.text && (
            <p className={`text-sm text-center ${resetState.status === 'sent' ? 'text-okglow' : 'text-badglow'}`}>{resetState.text}</p>
          )}
          <button
            type="submit"
            disabled={resetState.status === 'sending' || !resetEmail.trim()}
            className="bg-glow text-ink disabled:opacity-50 rounded-xl px-4 py-3 text-lg font-bold"
          >
            {resetState.status === 'sending' ? '寄送中...' : '寄送重設信'}
          </button>
          <button type="button" onClick={() => setMode('login')} className="text-white/50 hover:text-white text-sm">
            返回登入
          </button>
        </form>
      )}
    </div>
  )
}
