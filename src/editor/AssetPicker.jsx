import { assetUrl, formatBytes } from '../lib/assets.js'

// Small modal that lists assets of one type and calls onPick(asset).
export default function AssetPicker({ assets, type, title, onPick, onClose }) {
  const list = assets.filter((a) => a.type === type)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ backgroundColor: 'rgba(0, 10, 30, 0.6)' }}>
      <div className="bg-white text-navy rounded-2xl p-5 w-full max-w-3xl max-h-[80vh] flex flex-col gap-3 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button type="button" onClick={onClose} className="bg-slate-100 hover:bg-slate-200 rounded-lg px-3 py-1">
            關閉
          </button>
        </div>
        {list.length === 0 && <p className="text-slate-500 py-8 text-center">素材庫裡還沒有這種素材，請先在左側「素材」區上傳。</p>}
        <div className="grid grid-cols-3 md:grid-cols-4 gap-3 overflow-y-auto">
          {list.map((a) => (
            <button key={a.id} type="button" onClick={() => onPick(a)} className="border border-slate-200 hover:border-cyan rounded-xl overflow-hidden text-left">
              <div className="aspect-video bg-slate-100 flex items-center justify-center overflow-hidden">
                {a.type === 'image' ? (
                  <img src={assetUrl(a.storage_path)} alt={a.name} loading="lazy" className="w-full h-full object-contain" />
                ) : (
                  <span className="text-4xl">{a.type === 'video' ? '🎬' : '🎵'}</span>
                )}
              </div>
              <p className="px-2 py-1 text-xs truncate" title={a.name}>
                {a.name || a.storage_path}
              </p>
              <p className="px-2 pb-1 text-[11px] text-slate-500">{formatBytes(a.bytes)}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
