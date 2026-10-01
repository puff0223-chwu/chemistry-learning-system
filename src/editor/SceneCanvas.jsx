import { useEffect, useRef, useState } from 'react'
import { Layer, Line, Rect, Stage, Transformer } from 'react-konva'
import { CANVAS_H, CANVAS_W } from '../lib/missionSchema.js'
import SceneView from './SceneView.jsx'

const SNAP_PX = 8 // snap distance, in logical (1600x900) pixels
const MIN_SIZE = 12

const round = (n) => Math.round(n * 10) / 10

// Snaps a dragged box to the canvas edges/center and to the edges/centers of the other objects.
// Returns the corrected position plus the guide lines to draw.
function snap(box, others) {
  const xs = [0, CANVAS_W / 2, CANVAS_W]
  const ys = [0, CANVAS_H / 2, CANVAS_H]
  for (const o of others) {
    xs.push(o.x, o.x + o.w / 2, o.x + o.w)
    ys.push(o.y, o.y + o.h / 2, o.y + o.h)
  }
  const pick = (start, size, candidates) => {
    let best = null
    for (const edge of [start, start + size / 2, start + size]) {
      for (const c of candidates) {
        const d = c - edge
        if (Math.abs(d) <= SNAP_PX && (best === null || Math.abs(d) < Math.abs(best.d))) best = { d, line: c }
      }
    }
    return best
  }
  const sx = pick(box.x, box.w, xs)
  const sy = pick(box.y, box.h, ys)
  return {
    x: sx ? box.x + sx.d : box.x,
    y: sy ? box.y + sy.d : box.y,
    guides: [...(sx ? [{ vertical: true, at: sx.line }] : []), ...(sy ? [{ vertical: false, at: sy.line }] : [])],
  }
}

// The scene is drawn by the DOM (SceneView) so rich text, video and layer order are exact.
// A transparent Konva layer on top handles selecting, dragging and resizing/rotating (mouse and touch alike).
export default function SceneCanvas({ scene, assets, selectedId, zoom, onSelect, onChange, onDropAsset }) {
  const shapeRefs = useRef({})
  const transformerRef = useRef(null)
  const [guides, setGuides] = useState([])

  const selected = scene.objects.find((o) => o.id === selectedId)
  const selectedInteractive = selected && !selected.locked

  useEffect(() => {
    const transformer = transformerRef.current
    if (!transformer) return
    const node = selectedInteractive ? shapeRefs.current[selectedId] : null
    transformer.nodes(node ? [node] : [])
    transformer.getLayer()?.batchDraw()
  }, [selectedId, selectedInteractive, scene.objects])

  function handleDragMove(e, object) {
    const node = e.target
    let { x, y } = node.position()
    if (object.rotation === 0) {
      const result = snap({ x, y, w: object.w, h: object.h }, scene.objects.filter((o) => o.id !== object.id))
      x = result.x
      y = result.y
      node.position({ x, y })
      setGuides(result.guides)
    }
    onChange(object.id, { x: round(x), y: round(y) }, { key: `move-${object.id}` })
  }

  // Konva stretches a node with scaleX/scaleY while resizing; fold that back into width/height.
  function handleTransform(e, object) {
    const node = e.target
    const w = Math.max(MIN_SIZE, node.width() * node.scaleX())
    const h = Math.max(MIN_SIZE, node.height() * node.scaleY())
    node.scaleX(1)
    node.scaleY(1)
    node.width(w)
    node.height(h)
    onChange(object.id, { x: round(node.x()), y: round(node.y()), w: round(w), h: round(h), rotation: round(node.rotation()) }, { key: `transform-${object.id}` })
  }

  function handleDrop(e) {
    const assetId = e.dataTransfer.getData('application/x-asset-id')
    if (!assetId) return
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    onDropAsset(assetId, { x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom })
  }

  const width = CANVAS_W * zoom
  const height = CANVAS_H * zoom

  return (
    <div
      className="relative shadow-xl shrink-0"
      style={{ width, height }}
      onDragOver={(e) => e.dataTransfer.types.includes('application/x-asset-id') && e.preventDefault()}
      onDrop={handleDrop}
    >
      <div style={{ transform: `scale(${zoom})`, transformOrigin: '0 0', width: CANVAS_W, height: CANVAS_H }}>
        <SceneView scene={scene} assets={assets} editor />
      </div>
      <Stage
        width={width}
        height={height}
        scaleX={zoom}
        scaleY={zoom}
        className="absolute inset-0"
        onMouseDown={(e) => e.target === e.target.getStage() && onSelect(null)}
        onTouchStart={(e) => e.target === e.target.getStage() && onSelect(null)}
      >
        <Layer>
          {scene.objects.map((o) => (
            <Rect
              key={o.id}
              ref={(node) => {
                if (node) shapeRefs.current[o.id] = node
                else delete shapeRefs.current[o.id]
              }}
              x={o.x}
              y={o.y}
              width={o.w}
              height={o.h}
              rotation={o.rotation}
              fill="rgba(0,0,0,0.001)"
              listening={!o.locked}
              draggable={!o.locked}
              onMouseDown={() => onSelect(o.id)}
              onTouchStart={() => onSelect(o.id)}
              onDragMove={(e) => handleDragMove(e, o)}
              onDragEnd={() => setGuides([])}
              onTransform={(e) => handleTransform(e, o)}
              onMouseEnter={(e) => (e.target.getStage().container().style.cursor = 'move')}
              onMouseLeave={(e) => (e.target.getStage().container().style.cursor = 'default')}
            />
          ))}
          {selected && !selectedInteractive && (
            <Rect x={selected.x} y={selected.y} width={selected.w} height={selected.h} rotation={selected.rotation} stroke="#f59e0b" dash={[8, 6]} strokeWidth={2 / zoom} listening={false} />
          )}
          <Transformer
            ref={transformerRef}
            rotateEnabled
            rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
            anchorSize={10}
            borderStroke="#00b4d8"
            anchorStroke="#00b4d8"
            boundBoxFunc={(oldBox, newBox) => (newBox.width < MIN_SIZE * zoom || newBox.height < MIN_SIZE * zoom ? oldBox : newBox)}
          />
          {guides.map((g, i) => (
            <Line
              key={i}
              points={g.vertical ? [g.at, 0, g.at, CANVAS_H] : [0, g.at, CANVAS_W, g.at]}
              stroke="#f43f5e"
              strokeWidth={1 / zoom}
              dash={[6, 4]}
              listening={false}
            />
          ))}
        </Layer>
      </Stage>
    </div>
  )
}
