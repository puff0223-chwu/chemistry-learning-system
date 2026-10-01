import { useRef, useState } from 'react'
import { TYPE_LABELS, assetUrl } from '../lib/assets.js'
import { OBJECT_TYPE_LABELS } from '../lib/missionSchema.js'
import SceneView from './SceneView.jsx'

const THUMB_SCALE = 0.1 // 1600px -> 160px

const PALETTE = [
  { type: 'text', icon: '🔤' },
  { type: 'icon', icon: '⭐' },
  { type: 'hotspot', icon: '🎯' },
  { type: 'lock', icon: '🔐' },
]

function SceneThumb({ scene, assets }) {
  return (
    <div className="relative shrink-0 overflow-hidden rounded" style={{ width: 160 * 0.6, height: 90 * 0.6 }}>
      <div style={{ transform: `scale(${THUMB_SCALE * 0.6})`, transformOrigin: '0 0', width: 1600, height: 900 }}>
        <SceneView scene={scene} assets={assets} lite />
      </div>
    </div>
  )
}

export default function LeftPanel({ scenes, sceneId, startSceneId, assets, assetMap, onSelectScene, onAddScene, onAddObject, onAddAsset, onUpload, uploadMessage }) {
  const [typeFilter, setTypeFilter] = useState('all')
  const fileInput = useRef(null)
  const list = typeFilter === 'all' ? assets : assets.filter((a) => a.type === typeFilter)

  return (
    <aside className="w-64 shrink-0 bg-white border-r border-slate-200 flex flex-col overflow-hidden">
      <section className="p-3 border-b border-slate-200 flex flex-col gap-2 max-h-[34%] min-h-[120px]">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-sm">場景</h2>
          <button type="button" onClick={onAddScene} className="text-xs bg-cyan hover:bg-cyan-dark text-white rounded-lg px-2 py-1 font-bold">
            ＋ 新增
          </button>
        </div>
        <ul className="overflow-y-auto flex flex-col gap-1">
          {scenes.map((s) => (
            <li key={s.sceneId}>
              <button
                type="button"
                onClick={() => onSelectScene(s.sceneId)}
                className={`w-full flex items-center gap-2 rounded-lg p-1.5 text-left ${s.sceneId === sceneId ? 'bg-cyan/15 ring-1 ring-cyan' : 'hover:bg-slate-100'}`}
              >
                <SceneThumb scene={s} assets={assetMap} />
                <span className="min-w-0 text-sm">
                  <span className="block truncate font-bold">{s.name}</span>
                  <span className="block text-[11px] text-slate-500">
                    {s.sceneId === startSceneId && '★ 起始・'}
                    {s.objects.length} 個物件
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="p-3 border-b border-slate-200 flex flex-col gap-2">
        <h2 className="font-bold text-sm">加入物件</h2>
        <div className="grid grid-cols-2 gap-2">
          {PALETTE.map((p) => (
            <button
              key={p.type}
              type="button"
              onClick={() => onAddObject(p.type)}
              className="flex flex-col items-center gap-0.5 rounded-lg border border-slate-200 hover:border-cyan hover:bg-cyan/10 py-2 text-xs"
            >
              <span className="text-xl">{p.icon}</span>
              {OBJECT_TYPE_LABELS[p.type]}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-slate-500">圖片與影片請從下方素材點一下，或直接拖到畫布。</p>
      </section>

      <section className="p-3 flex-1 min-h-0 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-bold text-sm">素材</h2>
          <button type="button" onClick={() => fileInput.current?.click()} className="text-xs bg-slate-100 hover:bg-slate-200 rounded-lg px-2 py-1">
            ⬆ 上傳
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
        </div>
        {uploadMessage && <p className="text-[11px] text-slate-600 break-words">{uploadMessage}</p>}
        <div className="flex gap-1 text-xs">
          {['all', 'image', 'video', 'audio'].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTypeFilter(t)}
              className={`rounded-full px-2 py-0.5 border ${typeFilter === t ? 'bg-navy text-white border-navy' : 'border-slate-300'}`}
            >
              {t === 'all' ? '全部' : TYPE_LABELS[t]}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 overflow-y-auto content-start">
          {list.length === 0 && <p className="col-span-2 text-xs text-slate-400">還沒有素材，按「上傳」加入。</p>}
          {list.map((a) => {
            const placeable = a.type !== 'audio'
            return (
              <button
                key={a.id}
                type="button"
                draggable={placeable}
                onDragStart={(e) => e.dataTransfer.setData('application/x-asset-id', a.id)}
                onClick={() => placeable && onAddAsset(a)}
                title={placeable ? `${a.name}（點一下加入場景，或拖到畫布）` : `${a.name}（音訊要等事件系統完成後才能使用）`}
                className={`border border-slate-200 rounded-lg overflow-hidden text-left ${placeable ? 'hover:border-cyan' : 'opacity-60 cursor-not-allowed'}`}
              >
                <div className="aspect-video bg-slate-100 flex items-center justify-center overflow-hidden">
                  {a.type === 'image' ? (
                    <img src={assetUrl(a.storage_path)} alt="" loading="lazy" draggable={false} className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-2xl">{a.type === 'video' ? '🎬' : '🎵'}</span>
                  )}
                </div>
                <p className="px-1.5 py-0.5 text-[11px] truncate">{a.name || a.storage_path}</p>
              </button>
            )
          })}
        </div>
      </section>
    </aside>
  )
}
