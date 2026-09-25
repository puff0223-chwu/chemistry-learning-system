import { useState } from 'react'
import StudentFields, { PurposeSelect } from './StudentFields.jsx'
import { EMPTY_STUDENT, clearStudentInfo, getStudentInfo, saveStudentInfo } from '../lib/studentInfo.js'

export default function StudentInfoModal({ onSubmit, onClose }) {
  const saved = getStudentInfo()
  const [purpose, setPurpose] = useState(saved?.purpose ?? '')
  const [student, setStudent] = useState(
    saved ? { grade: saved.grade, className: saved.className, seatNumber: saved.seatNumber, name: saved.name } : EMPTY_STUDENT,
  )

  function handleSubmit(e) {
    e.preventDefault()
    const info = { purpose, ...student, name: student.name.trim() }
    saveStudentInfo(info)
    onSubmit(info)
  }

  function handleReset() {
    clearStudentInfo()
    setPurpose('')
    setStudent(EMPTY_STUDENT)
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
        className="glass-card relative rounded-2xl p-8 w-full max-w-sm max-h-full overflow-y-auto flex flex-col gap-4 shadow-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="關閉"
          className="absolute top-3 right-4 text-white/60 hover:text-white text-2xl leading-none"
        >
          ✕
        </button>
        <h2 className="text-2xl font-bold text-white text-center">請輸入你的資訊</h2>
        <PurposeSelect value={purpose} onChange={setPurpose} />
        <StudentFields value={student} onChange={setStudent} />
        <button
          type="submit"
          className="bg-glow hover:shadow-[0_0_20px_rgba(0,212,255,0.6)] text-ink rounded-xl px-4 py-3 text-lg font-bold transition-shadow"
        >
          確認
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="text-xs text-white/50 hover:text-white/80 underline self-center"
        >
          修改資訊
        </button>
      </form>
    </div>
  )
}
