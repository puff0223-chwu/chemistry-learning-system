import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminSignOut, getAdminSession, supabase } from '../lib/supabase.js'
import { validateNewPassword } from '../lib/password.js'

// Landing page of the link in the password-reset email. supabase-js reads the recovery token from the
// URL and signs the teacher in with a temporary session, which is what lets updateUser() work here.
export default function AdminResetPassword() {
  const navigate = useNavigate()
  const [status, setStatus] = useState(() => (/error/.test(window.location.hash) ? 'invalid' : 'checking'))
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [message, setMessage] = useState(null)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (status === 'invalid') return
    let settled = false
    const markReady = () => {
      settled = true
      setStatus('ready')
    }
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) markReady()
    })
    getAdminSession().then((session) => session && markReady())
    const timer = setTimeout(() => {
      if (!settled) setStatus('invalid')
    }, 4000)
    return () => {
      listener.subscription.unsubscribe()
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setMessage(null)
    const problem = validateNewPassword(password, confirmation)
    if (problem) return setMessage({ ok: false, text: problem })

    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setSaving(false)
      return setMessage({ ok: false, text: error.message })
    }
    // The recovery session is still signed in; end it so the teacher logs in with the new password.
    setDone(true)
    setMessage({ ok: true, text: '密碼已更新，即將前往登入頁…' })
    await adminSignOut()
    setTimeout(() => navigate('/admin', { replace: true }), 1500)
  }

  const input = 'glass-input rounded-xl px-4 py-3 text-lg outline-none focus:border-glow'

  return (
    <div className="min-h-screen flex items-center justify-center px-6 page-fade" style={{ background: '#0a0e1a' }}>
      <div className="glass-card w-full max-w-sm rounded-2xl p-8 flex flex-col gap-5 shadow-2xl">
        <h1 className="text-2xl font-bold text-center text-white">🔬 重設密碼</h1>

        {status === 'checking' && <p className="text-sub text-center">驗證連結中...</p>}

        {status === 'invalid' && (
          <>
            <p className="text-badglow text-center">這個重設連結無效或已過期，請回登入頁重新寄送重設信。</p>
            <button type="button" onClick={() => navigate('/admin')} className="bg-glow text-ink rounded-xl px-4 py-3 text-lg font-bold">
              回登入頁
            </button>
          </>
        )}

        {status === 'ready' && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <p className="text-sub text-center">請輸入新密碼</p>
            <label className="flex flex-col gap-1 text-sm text-sub">
              新密碼
              <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={input} autoFocus />
            </label>
            <label className="flex flex-col gap-1 text-sm text-sub">
              確認新密碼
              <input type="password" autoComplete="new-password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} className={input} />
            </label>
            {message && <p className={`text-sm text-center ${message.ok ? 'text-okglow' : 'text-badglow'}`}>{message.text}</p>}
            <button type="submit" disabled={saving || done} className="bg-glow text-ink disabled:opacity-50 rounded-xl px-4 py-3 text-lg font-bold">
              {saving ? '儲存中...' : '儲存'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
