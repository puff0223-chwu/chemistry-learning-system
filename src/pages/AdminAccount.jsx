import { useState } from 'react'
import AdminNav from '../components/AdminNav.jsx'
import { supabase } from '../lib/supabase.js'
import { MIN_PASSWORD_LENGTH, validateNewPassword } from '../lib/password.js'

export default function AdminAccount() {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [message, setMessage] = useState(null) // { ok, text }
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setMessage(null)
    const problem = validateNewPassword(password, confirmation)
    if (problem) return setMessage({ ok: false, text: problem })

    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password })
    setSaving(false)
    if (error) return setMessage({ ok: false, text: error.message })
    setPassword('')
    setConfirmation('')
    setMessage({ ok: true, text: '密碼已更新' })
  }

  const field = 'bg-white border border-slate-300 rounded-lg px-3 py-2 text-navy'

  return (
    <div className="min-h-screen bg-paper text-navy md:flex">
      <AdminNav active="account" />
      <div className="flex-1 min-w-0 max-w-xl w-full mx-auto px-6 py-8 flex flex-col gap-5">
        <h1 className="text-2xl font-bold">⚙️ 帳號設定</h1>
        <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col gap-4">
          <h2 className="text-lg font-bold">修改登入密碼</h2>
          <label className="flex flex-col gap-1 text-sm text-slate-600">
            新密碼
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={field}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate-600">
            確認新密碼
            <input
              type="password"
              autoComplete="new-password"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              className={field}
            />
          </label>
          <p className="text-xs text-slate-500">密碼長度至少 {MIN_PASSWORD_LENGTH} 個字元。更新後下次登入請使用新密碼。</p>
          {message && (
            <p className={`text-sm font-bold ${message.ok ? 'text-green-700' : 'text-red-600'}`}>{message.text}</p>
          )}
          <button
            type="submit"
            disabled={saving}
            className="bg-cyan hover:bg-cyan-dark disabled:opacity-50 text-white rounded-xl px-5 py-2 font-bold self-start"
          >
            {saving ? '儲存中...' : '儲存新密碼'}
          </button>
        </form>
      </div>
    </div>
  )
}
