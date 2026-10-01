import RichContent from '../components/RichContent.jsx'
import { assetUrl } from '../lib/assets.js'
import { CANVAS_H, CANVAS_W, parseYouTubeId } from '../lib/missionSchema.js'

function Missing({ label }) {
  return (
    <div className="w-full h-full flex items-center justify-center bg-slate-300/80 text-slate-600 text-2xl border-2 border-dashed border-slate-500">
      {label}
    </div>
  )
}

function ObjectBody({ object, assets, editor, lite }) {
  const asset = object.assetId ? assets[object.assetId] : null
  switch (object.type) {
    case 'image':
      return asset ? <img src={assetUrl(asset.storage_path)} alt="" draggable={false} className="w-full h-full" style={{ objectFit: 'fill' }} /> : <Missing label="🖼️ 素材遺失或未選擇" />
    case 'video': {
      const youtubeId = parseYouTubeId(object.youtubeUrl)
      if (youtubeId) {
        return (
          <div className="w-full h-full relative bg-black">
            <img src={`https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`} alt="" draggable={false} className="w-full h-full object-cover" />
            <span className="absolute inset-0 flex items-center justify-center text-6xl text-white drop-shadow">▶</span>
          </div>
        )
      }
      if (!asset) return <Missing label="🎬 素材遺失或未選擇" />
      if (lite) return <Missing label="🎬" />
      return <video src={assetUrl(asset.storage_path)} muted playsInline preload="metadata" className="w-full h-full bg-black" style={{ objectFit: 'contain' }} />
    }
    case 'icon':
      return (
        <div className="w-full h-full flex items-center justify-center leading-none select-none" style={{ fontSize: Math.min(object.w, object.h) * 0.8 }}>
          {object.icon}
        </div>
      )
    case 'text':
      return (
        <RichContent
          html={object.html}
          className="w-full h-full overflow-hidden"
          style={{ fontSize: object.fontSize, color: object.color, textAlign: object.align, background: object.background || 'transparent', padding: 8, lineHeight: 1.4 }}
        />
      )
    case 'hotspot':
      return editor ? (
        <div className="w-full h-full flex items-center justify-center border-2 border-dashed border-cyan-300 bg-cyan-300/20 text-cyan-100 text-xl">隱形點擊區</div>
      ) : null
    default:
      return <Missing label="？" />
  }
}

function SceneBackground({ background, assets }) {
  if (background?.type === 'image') {
    const asset = assets[background.assetId]
    if (asset) return <img src={assetUrl(asset.storage_path)} alt="" draggable={false} className="absolute inset-0 w-full h-full object-cover" />
  }
  return <div className="absolute inset-0" style={{ background: background?.type === 'color' ? background.color : '#1e293b' }} />
}

// Pure DOM rendering of one scene at its logical 1600x900 size. The editor lays Konva on top for interaction;
// the player (later phase) will reuse this view. Objects are stacked in array order (last = on top).
export default function SceneView({ scene, assets, editor = false, lite = false }) {
  return (
    <div className="relative overflow-hidden" style={{ width: CANVAS_W, height: CANVAS_H }}>
      <SceneBackground background={scene.background} assets={assets} />
      {scene.objects.map((o) => {
        const hidden = !o.visible
        if (hidden && !editor) return null
        return (
          <div
            key={o.id}
            className="absolute pointer-events-none"
            style={{
              left: o.x,
              top: o.y,
              width: o.w,
              height: o.h,
              transform: `rotate(${o.rotation}deg)`,
              transformOrigin: '0 0',
              opacity: hidden ? 0.25 : o.opacity,
              outline: hidden ? '2px dashed #94a3b8' : undefined,
            }}
          >
            <ObjectBody object={o} assets={assets} editor={editor} lite={lite} />
          </div>
        )
      })}
    </div>
  )
}
