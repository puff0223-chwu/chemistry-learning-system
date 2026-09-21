import { Link } from 'react-router-dom'

export default function Layout({ children, showAdminLink = true }) {
  return (
    <div className="min-h-screen bg-paper text-navy flex flex-col">
      {showAdminLink && (
        <div className="w-full flex justify-end p-2">
          <Link to="/admin" className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
            老師後台
          </Link>
        </div>
      )}
      <div className="flex-1 flex flex-col">{children}</div>
    </div>
  )
}
