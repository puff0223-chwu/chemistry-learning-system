export default function HeartDisplay({ hearts, max = 10, label }) {
  return (
    <div className="flex flex-col items-center gap-1">
      {label && <span className="text-xs text-slate-500">{label}</span>}
      <div className="flex flex-wrap justify-center gap-0.5 max-w-[90px]">
        {Array.from({ length: max }).map((_, i) => (
          <span key={i} className={`text-sm ${i < hearts ? 'text-red-500' : 'text-slate-300'}`}>
            ♥
          </span>
        ))}
      </div>
      <span className="text-lg font-bold">{hearts}</span>
    </div>
  )
}
