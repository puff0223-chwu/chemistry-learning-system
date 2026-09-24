export default function HeartDisplay({ hearts, max = 10, label, hit = false }) {
  return (
    <div className={`flex flex-col items-center gap-1 ${hit ? 'heart-hit' : ''}`}>
      {label && <span className="text-xs text-sub">{label}</span>}
      <div className="flex flex-wrap justify-center gap-0.5 max-w-[100px]">
        {Array.from({ length: max }).map((_, i) => (
          <span key={i} className="text-sm">
            {i < hearts ? '❤️' : '🖤'}
          </span>
        ))}
      </div>
      <span className="text-lg font-bold text-white">{hearts}</span>
    </div>
  )
}
