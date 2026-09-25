import { useState } from 'react'
import StudentFields, { PurposeSelect } from './StudentFields.jsx'
import { EMPTY_STUDENT } from '../lib/studentInfo.js'

// Collects both players' info for one battle. Nothing is remembered between battles.
export default function BattleInfoModal({ onSubmit, onClose }) {
  const [purpose, setPurpose] = useState('')
  const [playerA, setPlayerA] = useState(EMPTY_STUDENT)
  const [playerB, setPlayerB] = useState(EMPTY_STUDENT)

  function handleSubmit(e) {
    e.preventDefault()
    onSubmit({
      purpose,
      playerA: { ...playerA, name: playerA.name.trim() },
      playerB: { ...playerB, name: playerB.name.trim() },
    })
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center px-4 py-6 z-50"
      style={{ backgroundColor: 'rgba(0, 10, 30, 0.8)' }}
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="glass-card relative rounded-2xl p-6 md:p-8 w-full max-w-3xl max-h-full overflow-y-auto flex flex-col gap-5 shadow-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="關閉"
          className="absolute top-3 right-4 text-white/60 hover:text-white text-2xl leading-none"
        >
          ✕
        </button>
        <h2 className="text-2xl font-bold text-white text-center">請輸入雙方玩家資訊</h2>

        <div className="max-w-sm w-full self-center">
          <PurposeSelect value={purpose} onChange={setPurpose} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex flex-col gap-3">
            <h3 className="text-lg font-bold text-glow">玩家 A 資訊</h3>
            <StudentFields value={playerA} onChange={setPlayerA} />
          </div>
          <div className="flex flex-col gap-3">
            <h3 className="text-lg font-bold text-warnglow">玩家 B 資訊</h3>
            <StudentFields value={playerB} onChange={setPlayerB} />
          </div>
        </div>

        <button
          type="submit"
          className="bg-glow hover:shadow-[0_0_20px_rgba(0,212,255,0.6)] text-ink rounded-xl px-4 py-3 text-lg font-bold transition-shadow max-w-sm w-full self-center"
        >
          開始對戰
        </button>
      </form>
    </div>
  )
}
