export default function TopicCard({ topic, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left bg-navy-light border border-cyan/30 rounded-2xl p-6 hover:border-cyan hover:scale-[1.02] transition-all shadow-lg"
    >
      <h3 className="text-2xl font-bold text-cyan mb-2">{topic.name}</h3>
      {topic.description && (
        <p className="text-white/80 text-base leading-relaxed">{topic.description}</p>
      )}
    </button>
  )
}
