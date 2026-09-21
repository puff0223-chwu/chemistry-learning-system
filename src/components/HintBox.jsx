export default function HintBox({ text }) {
  if (!text) return null
  return (
    <div className="bg-yellow-300 text-navy-dark rounded-xl p-4 flex items-start gap-3 shadow-md">
      <span className="text-2xl leading-none">💡</span>
      <p className="text-lg font-medium leading-relaxed">{text}</p>
    </div>
  )
}

export function ExplanationBox({ text, answer }) {
  return (
    <div className="bg-slate-600 text-white rounded-xl p-4 flex items-start gap-3 shadow-md">
      <span className="text-2xl leading-none">📖</span>
      <div className="text-lg leading-relaxed">
        <p className="font-bold mb-1">正確答案：{answer}</p>
        {text && <p>{text}</p>}
      </div>
    </div>
  )
}
