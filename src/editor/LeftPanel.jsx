import { useState } from 'react'
import { assetUrl } from '../lib/assets.js'
import { OBJECT_TYPE_LABELS } from '../lib/missionSchema.js'
import AssetLibraryDialog from './AssetLibraryDialog.jsx'
import SceneView from './SceneView.jsx'

const THUMB_SCALE = 0.1 // 1600px -> 160px

const PALETTE = [
  { type: 'text', icon: '🔤' },
  { type: 'icon', icon: '⭐' },
  { type: 'hotspot', icon: '🎯' },
  { type: 'lock', icon: '🔐' },
  { type: 'socket', icon: '🔌' },
  { type: 'device', icon: '💡' },
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

export default function LeftPanel({ scenes, sceneId, startSceneId, assets, assetMap, onSelectScene, onSceneMenu, onAddScene, onAddObject, onAddAsset, onUpload, uploadMessage }) {
  const [library, setLibrary] = useState(false)

  // The whole column scrolls (nothing is ever squeezed out of reach on a short window); the long lists have their own scroll too.
  return (
    <aside className="w-64 shrink-0 bg-white border-r border-slate-200 flex flex-col overflow-y-auto">
      <section className="p-3 border-b border-slate-200 flex flex-col gap-2 shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-sm">場景（{scenes.length}）</h2>
          <button type="button" onClick={onAddScene} className="text-xs bg-cyan hover:bg-cyan-dark text-white rounded-lg px-2 py-1 font-bold">
            ＋ 新增
          </button>
        </div>
        <ul className="overflow-y-auto flex flex-col gap-1 max-h-64">
          {scenes.map((s) => (
            <li
              key={s.sceneId}
              onContextMenu={(e) => {
                e.preventDefault()
                onSceneMenu?.(e.clientX, e.clientY, s.sceneId)
              }}
            >
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
        <p className="text-[11px] text-slate-400">在場景上按右鍵，有複製、刪除等選項。</p>
      </section>

      <section className="p-3 border-b border-slate-200 flex flex-col gap-2 shrink-0">
        <h2 className="font-bold text-sm">加入物件</h2>
        <div className="grid grid-cols-3 gap-1.5">
          {PALETTE.map((p) => (
            <button
              key={p.type}
              type="button"
              onClick={() => onAddObject(p.type)}
              title={OBJECT_TYPE_LABELS[p.type]}
              className="flex flex-col items-center gap-0.5 rounded-lg border border-slate-200 hover:border-cyan hover:bg-cyan/10 py-1.5 text-[11px] leading-tight"
            >
              <span className="text-lg">{p.icon}</span>
              <span className="truncate max-w-full px-0.5">{OBJECT_TYPE_LABELS[p.type]}</span>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-slate-500">圖片與影片從下面的素材加入。也可以在畫布上按右鍵，直接加在滑鼠的位置。</p>
      </section>

      <section className="p-3 flex flex-col gap-2 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-bold text-sm">素材（{assets.length}）</h2>
          <button type="button" onClick={() => setLibrary(true)} className="text-xs bg-slate-100 hover:bg-slate-200 rounded-lg px-2 py-1 font-bold">
            🖼️ 放大／搜尋／上傳
          </button>
        </div>
        {uploadMessage && <p className="text-[11px] text-slate-600 break-words">{uploadMessage}</p>}
        <div className="grid grid-cols-3 gap-1.5 overflow-y-auto content-start auto-rows-max max-h-60">
          {assets.length === 0 && <p className="col-span-3 text-xs text-slate-400">還沒有素材，按上面「放大／搜尋／上傳」加入。</p>}
          {assets.map((a) => {
            const placeable = a.type !== 'audio'
            return (
              <button
                key={a.id}
                type="button"
                draggable={placeable}
                onDragStart={(e) => e.dataTransfer.setData('application/x-asset-id', a.id)}
                onClick={() => placeable && onAddAsset(a)}
                title={placeable ? `${a.name}（點一下加入場景，或拖到畫布）` : `${a.name}（音訊請在事件步驟「播放音效」裡選用）`}
                className={`border border-slate-200 rounded-md overflow-hidden ${placeable ? 'hover:border-cyan' : 'opacity-60 cursor-not-allowed'}`}
              >
                <div className="aspect-video bg-slate-100 flex items-center justify-center overflow-hidden">
                  {a.type === 'image' ? <img src={assetUrl(a.storage_path)} alt="" loading="lazy" draggable={false} className="w-full h-full object-cover" /> : <span className="text-lg">{a.type === 'video' ? '🎬' : '🎵'}</span>}
                </div>
              </button>
            )
          })}
        </div>
        <p className="text-[11px] text-slate-500">點一下加入場景，或拖到畫布上。素材很多時，用「放大／搜尋／上傳」比較好找。</p>
      </section>

      {library && <AssetLibraryDialog assets={assets} onPlace={onAddAsset} onUpload={onUpload} uploadMessage={uploadMessage} onClose={() => setLibrary(false)} />}
    </aside>
  )
}
