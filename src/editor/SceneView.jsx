import ErrorBoundary from '../components/ErrorBoundary.jsx'
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

function ObjectBody({ object, assets, editor, lite, interactive, isSolved, deviceState }) {
  const asset = object.assetId ? assets[object.assetId] : null
  switch (object.type) {
    case 'image':
      return asset ? <img src={assetUrl(asset.storage_path)} alt="" draggable={false} className="w-full h-full" style={{ objectFit: 'fill' }} /> : <Missing label="🖼️ 素材遺失或未選擇" />
    case 'video': {
      const youtubeId = parseYouTubeId(object.youtubeUrl)
      if (youtubeId && interactive) {
        return (
          <iframe
            title={object.name}
            src={`https://www.youtube-nocookie.com/embed/${youtubeId}?rel=0&playsinline=1`}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            className="w-full h-full border-0 bg-black"
          />
        )
      }
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
      return interactive ? (
        <video src={assetUrl(asset.storage_path)} autoPlay muted={object.muted !== false} loop={!!object.loop} playsInline controls className="w-full h-full bg-black" style={{ objectFit: 'contain' }} />
      ) : (
        <video src={assetUrl(asset.storage_path)} muted playsInline preload="metadata" className="w-full h-full bg-black" style={{ objectFit: 'contain' }} />
      )
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
    case 'lock': {
      const solved = !!isSolved?.(object.id)
      if (object.appearance === 'invisible') {
        return editor ? (
          <div className="w-full h-full flex items-center justify-center border-2 border-dashed border-amber-300 bg-amber-300/20 text-amber-100 text-xl">🔒 答案鎖（隱形）</div>
        ) : null
      }
      return (
        <div className="w-full h-full flex items-center justify-center leading-none select-none drop-shadow-lg" style={{ fontSize: Math.min(object.w, object.h) * 0.8 }}>
          {solved ? '🔓' : object.icon}
        </div>
      )
    }
    case 'socket':
      if (object.appearance === 'invisible') {
        return editor ? (
          <div className="w-full h-full flex items-center justify-center border-2 border-dashed border-emerald-300 bg-emerald-300/20 text-emerald-100 text-xl">🔌 插座（隱形）</div>
        ) : null
      }
      return (
        <div className="w-full h-full flex items-center justify-center leading-none select-none rounded-2xl border-4 border-dashed border-white/50 bg-black/20" style={{ fontSize: Math.min(object.w, object.h) * 0.55 }}>
          {object.icon}
        </div>
      )
    case 'device': {
      const states = object.states ?? []
      const now = states.find((s) => s.id === (deviceState ?? object.initialState)) ?? states[0]
      const stateAsset = now?.assetId ? assets[now.assetId] : null
      return stateAsset ? (
        <img src={assetUrl(stateAsset.storage_path)} alt="" draggable={false} className="w-full h-full" style={{ objectFit: 'contain' }} />
      ) : (
        <div className="w-full h-full flex items-center justify-center leading-none select-none drop-shadow-lg" style={{ fontSize: Math.min(object.w, object.h) * 0.8 }}>
          {now?.icon ?? '💡'}
        </div>
      )
    }
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

function BrokenObject() {
  return <div className="w-full h-full flex items-center justify-center bg-slate-700/70 text-slate-200 text-lg text-center p-2">此物件暫時無法使用</div>
}

// Pure DOM rendering of one scene at its logical 1600x900 size (last object = on top).
// The editor lays Konva on top for dragging; the player passes `interactive` and the callbacks below:
//   isVisible(object)      -> whether to show it right now (flags / conditions); default = its initial `visible`
//   background             -> overrides the scene background (swap_background)
//   onObjectClick(object)  -> called for objects that have click events
//   onObjectError(object, error) -> a broken object only shows a notice, the rest of the scene keeps working
export default function SceneView({ scene, assets, editor = false, lite = false, interactive = false, isVisible, isSolved, deviceStateOf, offsets, background, onObjectClick, onObjectPointerDown, onObjectError }) {
  return (
    <div className="relative overflow-hidden" style={{ width: CANVAS_W, height: CANVAS_H }}>
      <SceneBackground background={background ?? scene.background} assets={assets} />
      {scene.objects.map((o) => {
        const visibleNow = isVisible ? isVisible(o) : o.visible
        const hidden = !visibleNow
        if (hidden && !editor) return null
        const clickable = interactive && (o.onClick?.length > 0 || o.type === 'lock' || o.type === 'socket' || o.type === 'device' || (o.collectible && o.itemId))
        const draggable = interactive && o.moveInScene
        const shift = offsets?.[o.id]
        const youtube = interactive && o.type === 'video' && parseYouTubeId(o.youtubeUrl)
        return (
          <div
            key={o.id}
            data-object-id={o.id}
            data-socket-id={o.type === 'socket' ? o.id : undefined}
            className={`absolute ${clickable || youtube || draggable ? 'pointer-events-auto' : 'pointer-events-none'} ${draggable ? 'cursor-grab' : clickable ? 'cursor-pointer' : ''}`}
            onClick={clickable && !draggable ? () => onObjectClick?.(o) : undefined}
            onPointerDown={draggable ? (e) => onObjectPointerDown?.(e, o) : undefined}
            style={{
              left: o.x + (shift?.dx ?? 0),
              top: o.y + (shift?.dy ?? 0),
              width: o.w,
              height: o.h,
              touchAction: draggable ? 'none' : undefined,
              transform: `rotate(${o.rotation}deg)`,
              transformOrigin: '0 0',
              opacity: hidden ? 0.25 : o.opacity,
              outline: hidden ? '2px dashed #94a3b8' : undefined,
            }}
          >
            {editor && (o.onClick?.length > 0 || o.showWhen || o.visible === false || o.collectible || o.moveInScene) && (
              <span className="absolute top-0 left-0 z-10 rounded-br-lg bg-black/65 px-1.5 text-[30px] leading-tight whitespace-nowrap" title="⚡ 點擊有事件　⏳ 有出現條件或一開始隱藏　🎒 可以撿起　✋ 可以拖開">
                {o.onClick?.length > 0 ? '⚡' : ''}
                {o.showWhen || o.visible === false ? '⏳' : ''}
                {o.collectible ? '🎒' : ''}
                {o.moveInScene ? '✋' : ''}
              </span>
            )}
            <ErrorBoundary fallback={<BrokenObject />} onError={(err) => onObjectError?.(o, err)}>
              <ObjectBody object={o} assets={assets} editor={editor} lite={lite} interactive={interactive} isSolved={isSolved} deviceState={deviceStateOf?.(o)} />
            </ErrorBoundary>
          </div>
        )
      })}
    </div>
  )
}
