export default function TopicCard({ topic, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left bg-white border border-slate-200 rounded-2xl p-6 hover:border-cyan hover:scale-[1.02] transition-all shadow-md"
    >
      <h3 className="text-2xl font-bold text-cyan-dark mb-2">{topic.name}</h3>
      {topic.description && (
        <p className="text-slate-600 text-base leading-relaxed">{topic.description}</p>
      )}
    </button>
  )
}
