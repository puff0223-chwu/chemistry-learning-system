import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout.jsx'

export default function Home() {
  const navigate = useNavigate()

  return (
    <Layout>
      <div className="flex-1 flex flex-col items-center justify-center gap-10 px-6 py-12">
        <div className="text-center">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-wide mb-3">🧪 化學偵探社</h1>
          <p className="text-slate-600 text-lg">選擇你的化學學習模式</p>
        </div>

        <div className="w-full max-w-2xl grid grid-cols-1 md:grid-cols-2 gap-6">
          <button
            type="button"
            onClick={() => navigate('/task')}
            className="bg-cyan hover:bg-cyan-dark text-white transition-colors rounded-3xl py-14 px-6 text-2xl md:text-3xl font-bold shadow-xl"
          >
            🗺️ 任務闖關
          </button>
          <button
            type="button"
            onClick={() => navigate('/battle')}
            className="bg-cyan hover:bg-cyan-dark text-white transition-colors rounded-3xl py-14 px-6 text-2xl md:text-3xl font-bold shadow-xl"
          >
            ⚔️ 雙人對戰 PK
          </button>
        </div>
      </div>
    </Layout>
  )
}
