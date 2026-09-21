import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { getAdminSession } from '../lib/supabase.js'

export default function RequireAdmin({ children }) {
  const [status, setStatus] = useState('checking')

  useEffect(() => {
    let active = true
    getAdminSession().then((session) => {
      if (!active) return
      setStatus(session ? 'ok' : 'denied')
    })
    return () => {
      active = false
    }
  }, [])

  if (status === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper text-navy text-xl">
        驗證登入狀態中...
      </div>
    )
  }

  if (status === 'denied') {
    return <Navigate to="/admin" replace />
  }

  return children
}
