import { Link, useNavigate } from 'react-router-dom'
import { adminSignOut } from '../lib/supabase.js'

export default function AdminNav({ active }) {
  const navigate = useNavigate()

  async function handleLogout() {
    await adminSignOut()
    navigate('/admin')
  }

  return (
    <div className="w-full bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
      <div className="flex gap-4">
        <Link
          to="/admin/topics"
          className={`font-bold ${active === 'topics' ? 'text-cyan-dark' : 'text-slate-500 hover:text-navy'}`}
        >
          主題管理
        </Link>
        <Link
          to="/admin/questions"
          className={`font-bold ${active === 'questions' ? 'text-cyan-dark' : 'text-slate-500 hover:text-navy'}`}
        >
          題目管理
        </Link>
      </div>
      <div className="flex items-center gap-4">
        <Link to="/" className="text-slate-400 hover:text-navy text-sm">
          回首頁
        </Link>
        <button type="button" onClick={handleLogout} className="text-slate-400 hover:text-navy text-sm">
          登出
        </button>
      </div>
    </div>
  )
}
