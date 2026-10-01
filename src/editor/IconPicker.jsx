import { useState } from 'react'
import { ICON_CATEGORIES, searchIcons } from './icons.js'

// Pick an icon by searching ("鑰匙") or browsing categories. Any emoji can also be typed or pasted.
export default function IconPicker({ current, onPick, onClose }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState(null)
  const [custom, setCustom] = useState('')
  const results = searchIcons(query, query ? null : category)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ backgroundColor: 'rgba(0, 10, 30, 0.6)' }} onClick={onClose}>
      <div className="bg-white text-navy rounded-2xl p-5 w-full max-w-2xl max-h-[85vh] flex flex-col gap-3 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">選擇圖示</h2>
          <button type="button" onClick={onClose} className="bg-slate-100 hover:bg-slate-200 rounded-lg px-3 py-1">
            關閉
          </button>
        </div>

        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="🔍 輸入名稱搜尋，例如：鑰匙、顯微鏡、血跡、門"
          className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2"
        />

        {!query && (
          <div className="flex flex-wrap gap-1.5">
            {[null, ...ICON_CATEGORIES].map((c) => (
              <button
                key={c ?? 'all'}
                type="button"
                onClick={() => setCategory(c)}
                className={`rounded-full px-3 py-1 text-sm border ${category === c ? 'bg-navy text-white border-navy' : 'border-slate-300 hover:bg-slate-100'}`}
              >
                {c ?? '全部'}
              </button>
            ))}
          </div>
        )}

        <div className="overflow-y-auto grid grid-cols-6 sm:grid-cols-8 gap-1.5 content-start min-h-[12rem]">
          {results.length === 0 && <p className="col-span-full text-slate-500 text-center py-8">找不到「{query}」。換個說法試試，或在下面貼上任何表情符號。</p>}
          {results.map((i) => (
            <button
              key={i.emoji + i.category}
              type="button"
              onClick={() => onPick(i.emoji)}
              title={i.words.join('、')}
              className={`flex flex-col items-center justify-center rounded-lg py-1.5 hover:bg-cyan/15 ${current === i.emoji ? 'ring-2 ring-cyan bg-cyan/10' : ''}`}
            >
              <span className="text-3xl leading-none">{i.emoji}</span>
              <span className="text-[11px] text-slate-500 mt-1 truncate max-w-full px-0.5">{i.words[0]}</span>
            </button>
          ))}
        </div>

        <div className="border-t border-slate-200 pt-3 flex flex-col gap-1.5">
          <div className="flex gap-2 items-center">
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="找不到？貼上任何表情符號"
              className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-1.5"
            />
            <button
              type="button"
              disabled={!custom.trim()}
              onClick={() => onPick([...custom.trim()].slice(0, 4).join(''))}
              className="bg-cyan hover:bg-cyan-dark disabled:opacity-40 text-white rounded-lg px-4 py-1.5 font-bold"
            >
              使用
            </button>
          </div>
          <p className="text-xs text-slate-500">想用自己的圖片，請改用左邊「素材」裡的圖片（可上傳照片、手繪圖）。</p>
        </div>
      </div>
    </div>
  )
}
