import { useState } from 'react'

const STORAGE_KEY = 'chemistry_student_info'

export function getStudentInfo() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveStudentInfo(info) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(info))
  } catch {
    // sessionStorage unavailable — proceed without persisting
  }
}

export default function StudentInfoModal({ onSubmit }) {
  const [className, setClassName] = useState('')
  const [seatNumber, setSeatNumber] = useState('')
  const [name, setName] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    const info = { className: className.trim(), seatNumber: seatNumber.trim(), name: name.trim() }
    saveStudentInfo(info)
    onSubmit(info)
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center px-4 z-50"
      style={{ backgroundColor: 'rgba(0, 10, 30, 0.8)' }}
    >
      <form
        onSubmit={handleSubmit}
        className="glass-card rounded-2xl p-8 w-full max-w-sm flex flex-col gap-5 shadow-2xl"
      >
        <h2 className="text-2xl font-bold text-white text-center">請輸入你的資訊</h2>
        <label className="flex flex-col gap-1 text-sm text-sub">
          班級
          <input
            required
            value={className}
            onChange={(e) => setClassName(e.target.value)}
            placeholder="例如：高一忠班"
            className="glass-input rounded-xl px-4 py-3 text-lg outline-none focus:border-glow"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-sub">
          座號
          <input
            required
            value={seatNumber}
            onChange={(e) => setSeatNumber(e.target.value)}
            placeholder="例如：12"
            className="glass-input rounded-xl px-4 py-3 text-lg outline-none focus:border-glow"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-sub">
          姓名
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：王小明"
            className="glass-input rounded-xl px-4 py-3 text-lg outline-none focus:border-glow"
          />
        </label>
        <button
          type="submit"
          className="bg-glow hover:shadow-[0_0_20px_rgba(0,212,255,0.6)] text-ink rounded-xl px-4 py-3 text-lg font-bold transition-shadow"
        >
          確認
        </button>
      </form>
    </div>
  )
}
