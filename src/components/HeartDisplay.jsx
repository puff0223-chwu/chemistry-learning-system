import { useEffect, useRef, useState } from 'react'

export default function HeartDisplay({ hearts, max = 10 }) {
  const prev = useRef(hearts)
  const [lost, setLost] = useState(null)

  useEffect(() => {
    if (hearts < prev.current) {
      setLost({ from: hearts, to: prev.current })
      const t = setTimeout(() => setLost(null), 500)
      prev.current = hearts
      return () => clearTimeout(t)
    }
    prev.current = hearts
    setLost(null)
  }, [hearts])

  return (
    <div className={`flex items-center gap-0.5 rounded-lg px-1 ${lost ? 'hp-flash' : ''}`}>
      {Array.from({ length: max }).map((_, i) => {
        if (i < hearts) return <span key={i} className="text-base leading-none">❤️</span>
        if (lost && i >= lost.from && i < lost.to) {
          return (
            <span key={i} className="relative inline-block text-base leading-none">
              🖤
              <span className="absolute inset-0 heart-vanish">❤️</span>
            </span>
          )
        }
        return <span key={i} className="text-base leading-none">🖤</span>
      })}
      <span className="ml-1 text-sm font-bold text-white">{hearts}</span>
    </div>
  )
}
