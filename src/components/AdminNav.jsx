import { Link, useNavigate } from 'react-router-dom'
import { adminSignOut } from '../lib/supabase.js'

export default function AdminNav({ active }) {
  const navigate = useNavigate()

  async function handleLogout() {
    await adminSignOut()
    navigate('/admin')
  }

  return (
    <div className="w-full bg-navy-dark border-b border-white/10 px-6 py-3 flex items-center justify-between">
      <div className="flex gap-4">
        <Link
          to="/admin/topics"
          className={`font-bold ${active === 'topics' ? 'text-cyan' : 'text-white/70 hover:text-white'}`}
        >
          主題管理
        </Link>
        <Link
          to="/admin/questions"
          className={`font-bold ${active === 'questions' ? 'text-cyan' : 'text-white/70 hover:text-white'}`}
        >
          題目管理
        </Link>
      </div>
      <div className="flex items-center gap-4">
        <Link to="/" className="text-white/50 hover:text-white text-sm">
          回首頁
        </Link>
        <button type="button" onClick={handleLogout} className="text-white/50 hover:text-white text-sm">
          登出
        </button>
      </div>
    </div>
  )
}
