import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Home from './pages/Home.jsx'
import TaskSelect from './pages/TaskSelect.jsx'
import TaskPlay from './pages/TaskPlay.jsx'
import BattleSelect from './pages/BattleSelect.jsx'
import BattlePlay from './pages/BattlePlay.jsx'
import AdminLogin from './pages/AdminLogin.jsx'
import AdminResetPassword from './pages/AdminResetPassword.jsx'
import RequireAdmin from './components/RequireAdmin.jsx'

// Admin pages (rich-text editor, Excel export, ...) are only downloaded when a teacher opens them.
const AdminTopics = lazy(() => import('./pages/AdminTopics.jsx'))
const AdminQuestions = lazy(() => import('./pages/AdminQuestions.jsx'))
const AdminTags = lazy(() => import('./pages/AdminTags.jsx'))
const AdminAppearance = lazy(() => import('./pages/AdminAppearance.jsx'))
const AdminAccount = lazy(() => import('./pages/AdminAccount.jsx'))
const AdminTaskLogs = lazy(() => import('./pages/AdminTaskLogs.jsx'))
const AdminBattleLogs = lazy(() => import('./pages/AdminBattleLogs.jsx'))

function admin(element) {
  return <RequireAdmin>{element}</RequireAdmin>
}

function App() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-slate-500">載入中...</div>}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/task" element={<TaskSelect />} />
        <Route path="/task/:topicId" element={<TaskPlay />} />
        <Route path="/battle" element={<BattleSelect />} />
        <Route path="/battle/:topicId" element={<BattlePlay />} />
        <Route path="/admin" element={<AdminLogin />} />
        <Route path="/admin/reset-password" element={<AdminResetPassword />} />
        <Route path="/admin/topics" element={admin(<AdminTopics />)} />
        <Route path="/admin/questions" element={admin(<AdminQuestions />)} />
        <Route path="/admin/tags" element={admin(<AdminTags />)} />
        <Route path="/admin/appearance" element={admin(<AdminAppearance />)} />
        <Route path="/admin/account" element={admin(<AdminAccount />)} />
        <Route path="/admin/logs/task" element={admin(<AdminTaskLogs />)} />
        <Route path="/admin/logs/battle" element={admin(<AdminBattleLogs />)} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}

export default App
