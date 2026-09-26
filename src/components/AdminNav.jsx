import { Link, useNavigate } from 'react-router-dom'
import { adminSignOut } from '../lib/supabase.js'

function NavLink({ to, active, current, children, indent }) {
  const isActive = active === current
  return (
    <Link
      to={to}
      className={`block rounded-lg px-3 py-2 text-base whitespace-nowrap ${indent ? 'ml-4' : 'font-bold'} ${
        isActive ? 'bg-[#00b4d8] text-white' : 'text-[#c9d6e6] hover:bg-[#2d4f7c] hover:text-white'
      }`}
    >
      {children}
    </Link>
  )
}

export default function AdminNav({ active }) {
  const navigate = useNavigate()

  async function handleLogout() {
    await adminSignOut()
    navigate('/admin')
  }

  return (
    <aside className="bg-navy text-white md:w-56 md:shrink-0 md:h-screen md:sticky md:top-0 p-4 flex md:flex-col gap-1 overflow-x-auto md:overflow-y-auto">
      <p className="hidden md:block text-lg font-extrabold px-3 pb-3">🔬 教師後台</p>
      <NavLink to="/admin/topics" active={active} current="topics">
        主題管理
      </NavLink>
      <NavLink to="/admin/questions" active={active} current="questions">
        題目管理
      </NavLink>

      <NavLink to="/admin/tags" active={active} current="tags">
        🏷️ 標籤管理
      </NavLink>

      <p className="hidden md:block text-sm text-[#9fb3cc] px-3 pt-4 pb-1">📊 學習資料</p>
      <NavLink to="/admin/logs/task" active={active} current="task-logs" indent>
        任務關卡資料
      </NavLink>
      <NavLink to="/admin/logs/battle" active={active} current="battle-logs" indent>
        對戰資料
      </NavLink>

      <div className="hidden md:block h-3" />
      <NavLink to="/admin/appearance" active={active} current="appearance">
        🎨 外觀設定
      </NavLink>
      <NavLink to="/admin/account" active={active} current="account">
        ⚙️ 帳號設定
      </NavLink>

      <div className="md:mt-auto flex md:flex-col gap-1 md:pt-6">
        <Link to="/" className="block rounded-lg px-3 py-2 text-sm text-[#9fb3cc] hover:text-white whitespace-nowrap">
          回首頁
        </Link>
        <button
          type="button"
          onClick={handleLogout}
          className="block text-left rounded-lg px-3 py-2 text-sm text-[#9fb3cc] hover:text-white whitespace-nowrap"
        >
          登出
        </button>
      </div>
    </aside>
  )
}
