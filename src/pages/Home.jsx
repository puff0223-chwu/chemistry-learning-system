import { useNavigate } from 'react-router-dom'
import PageBackground from '../components/PageBackground.jsx'

export default function Home() {
  const navigate = useNavigate()

  return (
    <PageBackground image="/bg-home.jpg.png">
      <div className="flex justify-between items-start px-6 py-5">
        <span className="text-white text-sm md:text-base font-bold">🔬 化學鑑識學習系統</span>
        <button
          type="button"
          onClick={() => navigate('/admin')}
          className="text-xs text-white/70 border border-white/30 rounded-full px-3 py-1 hover:bg-white/10 transition-colors"
        >
          教師後台
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-12 px-6 py-8">
        <div className="text-center">
          <h1
            className="text-4xl md:text-5xl font-extrabold tracking-wide text-white mb-3"
            style={{ textShadow: '0 2px 12px rgba(0,0,0,0.6)' }}
          >
            化學鑑識學習系統
          </h1>
          <p className="text-sub text-lg">選擇你的學習模式，開始探索化學的世界</p>
        </div>

        <div className="w-full max-w-3xl grid grid-cols-1 md:grid-cols-2 gap-6">
          <button
            type="button"
            onClick={() => navigate('/task')}
            className="glass-card glow-hover rounded-2xl p-8 flex flex-col items-center gap-3 text-center"
            style={{ borderBottom: '3px solid #00D4FF' }}
          >
            <span className="text-5xl">🗺️</span>
            <span className="text-2xl font-bold text-white">任務關卡</span>
            <span className="text-sm text-sub">跟著情境故事，逐步突破化學難關</span>
          </button>

          <button
            type="button"
            onClick={() => navigate('/battle')}
            className="glass-card glow-hover rounded-2xl p-8 flex flex-col items-center gap-3 text-center"
            style={{ borderBottom: '3px solid #FFB800' }}
          >
            <span className="text-5xl">⚔️</span>
            <span className="text-2xl font-bold text-white">雙人對戰 PK</span>
            <span className="text-sm text-sub">兩人同台競速，用知識一決勝負</span>
          </button>
        </div>
      </div>

      <div className="text-center pb-4">
        <span className="text-xs text-white/40">© 巫魚子老師 化學學習系統</span>
      </div>
    </PageBackground>
  )
}
