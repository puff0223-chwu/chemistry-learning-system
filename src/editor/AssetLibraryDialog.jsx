import { useRef, useState } from 'react'
import { TYPE_LABELS, assetUrl, formatBytes } from '../lib/assets.js'

// The big asset library window opened from the editor's left panel: search, filter by kind, upload, and place into the scene.
// The grid scrolls with the mouse wheel however many assets there are.
export default function AssetLibraryDialog({ assets, onPlace, onUpload, uploadMessage, onClose }) {
  const [typeFilter, setTypeFilter] = useState('all')
  const [query, setQuery] = useState('')
  const fileInput = useRef(null)
  const q = query.trim().toLowerCase()
  const list = assets.filter((a) => (typeFilter === 'all' || a.type === typeFilter) && (!q || (a.name || a.storage_path || '').toLowerCase().includes(q)))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ backgroundColor: 'rgba(0, 10, 30, 0.6)' }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white text-navy rounded-2xl p-5 w-full max-w-5xl h-[85vh] flex flex-col gap-3 shadow-xl">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-lg font-bold">🖼️ 素材庫</h2>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="🔎 用名稱搜尋…" className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-sm w-56" autoFocus />
          <div className="flex gap-1 text-sm">
            {['all', 'image', 'video', 'audio'].map((t) => (
              <button key={t} type="button" onClick={() => setTypeFilter(t)} className={`rounded-full px-3 py-1 border ${typeFilter === t ? 'bg-navy text-white border-navy' : 'border-slate-300 hover:bg-slate-50'}`}>
                {t === 'all' ? '全部' : TYPE_LABELS[t]}
              </button>
            ))}
          </div>
          <span className="flex-1" />
          <button type="button" onClick={() => fileInput.current?.click()} className="bg-cyan hover:bg-cyan-dark text-white rounded-lg px-3 py-1.5 text-sm font-bold">
            ⬆ 上傳新素材
          </button>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept="image/*,video/mp4,video/webm,audio/mpeg,audio/mp4,audio/aac,audio/ogg,.m4a,.mp3,.aac"
            className="hidden"
            onChange={(e) => {
              onUpload(Array.from(e.target.files))
              e.target.value = ''
            }}
          />
          <button type="button" onClick={onClose} className="bg-slate-100 hover:bg-slate-200 rounded-lg px-3 py-1.5 text-sm">
            關閉
          </button>
        </div>
        {uploadMessage && <p className="text-xs text-slate-600 break-words">{uploadMessage}</p>}
        <p className="text-xs text-slate-500">點一下圖片或影片，就會放進目前的場景。共 {assets.length} 個素材{list.length !== assets.length ? `，符合條件的有 ${list.length} 個` : ''}。</p>
        <div className="flex-1 min-h-0 overflow-y-auto">
          {list.length === 0 && <p className="text-slate-400 py-12 text-center">{assets.length === 0 ? '還沒有素材，按右上角「上傳新素材」加入。' : '沒有符合的素材。'}</p>}
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3 content-start auto-rows-max">
            {list.map((a) => {
              const placeable = a.type !== 'audio'
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    if (!placeable) return
                    onPlace(a)
                    onClose()
                  }}
                  title={placeable ? `${a.name}（點一下放進場景）` : `${a.name}（音訊請在事件步驟「播放音效」裡選用）`}
                  className={`border border-slate-200 rounded-xl overflow-hidden text-left ${placeable ? 'hover:border-cyan hover:shadow' : 'opacity-60 cursor-not-allowed'}`}
                >
                  <div className="aspect-video bg-slate-100 flex items-center justify-center overflow-hidden">
                    {a.type === 'image' ? <img src={assetUrl(a.storage_path)} alt="" loading="lazy" draggable={false} className="w-full h-full object-contain" /> : <span className="text-4xl">{a.type === 'video' ? '🎬' : '🎵'}</span>}
                  </div>
                  <p className="px-2 py-1 text-xs truncate" title={a.name}>
                    {a.name || a.storage_path}
                  </p>
                  <p className="px-2 pb-1 text-[11px] text-slate-500">{formatBytes(a.bytes)}</p>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
