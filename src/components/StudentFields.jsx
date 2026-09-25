import { useRef, useState } from 'react'
import { GRADES, PURPOSES, filterClassName, filterSeatNumber } from '../lib/studentInfo.js'

const INPUT_CLASS = 'glass-input rounded-xl px-4 py-3 text-lg outline-none focus:border-glow w-full'
const LABEL_CLASS = 'flex flex-col gap-1 text-sm text-sub'

export function PurposeSelect({ value, onChange }) {
  return (
    <label className={LABEL_CLASS}>
      用途
      <select required value={value} onChange={(e) => onChange(e.target.value)} className={INPUT_CLASS}>
        <option value="">請選擇</option>
        {PURPOSES.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
    </label>
  )
}

function ClassNameInput({ value, onChange }) {
  const composing = useRef(false)
  const [warn, setWarn] = useState(false)

  function apply(raw) {
    const filtered = filterClassName(raw)
    setWarn(filtered !== raw)
    onChange(filtered)
  }

  return (
    <label className={LABEL_CLASS}>
      班級
      <input
        required
        type="text"
        value={value}
        onChange={(e) => {
          // Don't strip characters while an IME (e.g. Zhuyin) is still composing.
          if (composing.current) onChange(e.target.value)
          else apply(e.target.value)
        }}
        onCompositionStart={() => {
          composing.current = true
        }}
        onCompositionEnd={(e) => {
          composing.current = false
          apply(e.target.value)
        }}
        placeholder="例如：忠班 或 3"
        className={INPUT_CLASS}
      />
      {warn && <span className="text-xs text-warnglow">班級只能輸入中文字或數字</span>}
    </label>
  )
}

// 年級 / 班級 / 座號 / 姓名 for one student. `value` = { grade, className, seatNumber, name }.
export default function StudentFields({ value, onChange }) {
  const set = (patch) => onChange({ ...value, ...patch })
  return (
    <div className="flex flex-col gap-4">
      <label className={LABEL_CLASS}>
        年級
        <select required value={value.grade} onChange={(e) => set({ grade: e.target.value })} className={INPUT_CLASS}>
          <option value="">請選擇</option>
          {GRADES.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </label>
      <ClassNameInput value={value.className} onChange={(v) => set({ className: v })} />
      <label className={LABEL_CLASS}>
        座號
        <input
          required
          type="text"
          inputMode="numeric"
          value={value.seatNumber}
          onChange={(e) => set({ seatNumber: filterSeatNumber(e.target.value) })}
          placeholder="例如：12"
          className={INPUT_CLASS}
        />
      </label>
      <label className={LABEL_CLASS}>
        姓名
        <input
          required
          type="text"
          value={value.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="例如：王小明"
          className={INPUT_CLASS}
        />
      </label>
    </div>
  )
}
