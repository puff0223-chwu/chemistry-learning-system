import { Navigate, Route, Routes } from 'react-router-dom'
import Home from './pages/Home.jsx'
import TaskSelect from './pages/TaskSelect.jsx'
import TaskPlay from './pages/TaskPlay.jsx'
import BattleSelect from './pages/BattleSelect.jsx'
import BattlePlay from './pages/BattlePlay.jsx'
import AdminLogin from './pages/AdminLogin.jsx'
import AdminTopics from './pages/AdminTopics.jsx'
import AdminQuestions from './pages/AdminQuestions.jsx'
import RequireAdmin from './components/RequireAdmin.jsx'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/task" element={<TaskSelect />} />
      <Route path="/task/:topicId" element={<TaskPlay />} />
      <Route path="/battle" element={<BattleSelect />} />
      <Route path="/battle/:topicId" element={<BattlePlay />} />
      <Route path="/admin" element={<AdminLogin />} />
      <Route
        path="/admin/topics"
        element={
          <RequireAdmin>
            <AdminTopics />
          </RequireAdmin>
        }
      />
      <Route
        path="/admin/questions"
        element={
          <RequireAdmin>
            <AdminQuestions />
          </RequireAdmin>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
