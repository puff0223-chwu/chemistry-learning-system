import { useEffect, useRef, useState } from 'react'
import { Layer, Line, Rect, Stage, Transformer } from 'react-konva'
import { CANVAS_H, CANVAS_W } from '../lib/missionSchema.js'
import { nextSelection, objectsInRect, selectionBounds, transformMembers } from './groupOps.js'
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
// A transparent Konva layer on top handles selecting (click, Shift+click, drag a box), dragging and
// resizing/rotating (mouse and touch alike). With several objects selected, one invisible box around them
// is resized/rotated and every member follows (see groupOps.transformMembers).
export default function SceneCanvas({ scene, assets, selectedIds, zoom, onSelect, onSelectMany, onChange, onChangeMany, onDropAsset, onContextMenu }) {
  const shapeRefs = useRef({})
  const proxyRef = useRef(null)
  const transformerRef = useRef(null)
  const dragStart = useRef(null)
  const gesture = useRef(null) // { startBox, starts } while a group box is being resized/rotated
  const [frozenBox, setFrozenBox] = useState(null)
  const [guides, setGuides] = useState([])
  const [marquee, setMarquee] = useState(null) // { x0, y0, x1, y1 } in logical pixels

  const selected = scene.objects.filter((o) => selectedIds.includes(o.id))
  const multi = selected.length > 1
  const only = selected.length === 1 ? selected[0] : null
  const interactive = selected.filter((o) => !o.locked)
  const liveBox = multi ? selectionBounds(selected) : null
  const box = frozenBox ?? liveBox

  useEffect(() => {
    const transformer = transformerRef.current
    if (!transformer) return
    let node = null
    if (multi && interactive.length === selected.length) node = proxyRef.current
    else if (only && !only.locked) node = shapeRefs.current[only.id]
    transformer.nodes(node ? [node] : [])
    transformer.getLayer()?.batchDraw()
  }, [multi, only, interactive.length, selected.length, scene.objects])

  const pointer = (e) => {
    const p = e.target.getStage().getPointerPosition()
    return { x: p.x / zoom, y: p.y / zoom }
  }

  // ---- select -------------------------------------------------------------------------------------
  function handlePress(e, object) {
    const mod = e.evt
    const additive = mod.shiftKey || mod.ctrlKey || mod.metaKey
    // pressing something that is already selected keeps the selection, so the whole selection can be dragged
    if (selectedIds.includes(object.id) && !additive && !mod.altKey) return
    onSelect(object.id, { additive, single: mod.altKey })
  }

  function handleStagePress(e) {
    if (e.target !== e.target.getStage()) return
    if (e.evt.button === 2) return // right button opens the menu, it does not start a selection box
    const p = pointer(e)
    setMarquee({ x0: p.x, y0: p.y, x1: p.x, y1: p.y, additive: e.evt.shiftKey })
  }

  function handleStageMove(e) {
    if (!marquee) return
    const p = pointer(e)
    setMarquee({ ...marquee, x1: p.x, y1: p.y })
  }

  function handleStageRelease() {
    if (!marquee) return
    const rect = { x: Math.min(marquee.x0, marquee.x1), y: Math.min(marquee.y0, marquee.y1), w: Math.abs(marquee.x1 - marquee.x0), h: Math.abs(marquee.y1 - marquee.y0) }
    setMarquee(null)
    if (rect.w < 6 && rect.h < 6) {
      if (!marquee.additive) onSelect(null)
      return
    }
    // everything the box touches; touching one member takes its whole group
    let ids = marquee.additive ? [...selectedIds] : []
    for (const o of objectsInRect(scene.objects.filter((x) => !x.locked), rect)) ids = [...new Set([...ids, ...nextSelection(scene, [], o.id)])]
    onSelectMany(ids)
  }

  // ---- drag ---------------------------------------------------------------------------------------
  function handleDragStart(e, object) {
    const group = selectedIds.includes(object.id) && selected.length > 1 ? selected.filter((o) => !o.locked) : [object]
    dragStart.current = { x: object.x, y: object.y, members: group.map((o) => ({ id: o.id, x: o.x, y: o.y })) }
  }

  function handleDragMove(e, object) {
    const node = e.target
    let { x, y } = node.position()
    const start = dragStart.current
    if (start && start.members.length > 1) {
      const dx = x - start.x
      const dy = y - start.y
      onChangeMany(
        start.members.map((m) => ({ id: m.id, patch: { x: round(m.x + dx), y: round(m.y + dy) } })),
        { key: 'move-selection' },
      )
      return
    }
    if (object.rotation === 0) {
      const result = snap({ x, y, w: object.w, h: object.h }, scene.objects.filter((o) => o.id !== object.id))
      x = result.x
      y = result.y
      node.position({ x, y })
      setGuides(result.guides)
    }
    onChange(object.id, { x: round(x), y: round(y) }, { key: `move-${object.id}` })
  }

  // ---- resize / rotate ----------------------------------------------------------------------------
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

  function handleGroupTransformStart() {
    gesture.current = { startBox: liveBox, starts: selected.map((o) => ({ id: o.id, x: o.x, y: o.y, w: o.w, h: o.h, rotation: o.rotation })) }
    setFrozenBox(liveBox) // the box must not follow the members while it is being dragged
  }

  function handleGroupTransform(e) {
    const g = gesture.current
    if (!g) return
    const node = e.target
    const w = Math.max(MIN_SIZE, node.width() * node.scaleX())
    const h = Math.max(MIN_SIZE, node.height() * node.scaleY())
    node.scaleX(1)
    node.scaleY(1)
    node.width(w)
    node.height(h)
    onChangeMany(transformMembers(g.starts, g.startBox, { x: node.x(), y: node.y(), w, h, rotation: node.rotation() }), { key: 'transform-selection' })
  }

  function handleGroupTransformEnd() {
    gesture.current = null
    const node = proxyRef.current
    node?.rotation(0)
    setFrozenBox(null)
  }

  // Right-click: on an object = that object's menu, on empty canvas = the "add here" menu.
  function handleContext(e) {
    e.evt.preventDefault()
    const stage = e.target.getStage()
    onContextMenu?.({ clientX: e.evt.clientX, clientY: e.evt.clientY, objectId: e.target === stage ? null : e.target.id() || null, point: pointer(e) })
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
  const groupLocked = multi && interactive.length !== selected.length

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
      <Stage width={width} height={height} scaleX={zoom} scaleY={zoom} className="absolute inset-0" onMouseDown={handleStagePress} onTouchStart={handleStagePress} onMouseMove={handleStageMove} onTouchMove={handleStageMove} onMouseUp={handleStageRelease} onTouchEnd={handleStageRelease} onContextMenu={handleContext}>
        <Layer>
          {scene.objects.map((o) => (
            <Rect
              key={o.id}
              id={o.id}
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
              onMouseDown={(e) => handlePress(e, o)}
              onTouchStart={(e) => handlePress(e, o)}
              onDragStart={(e) => handleDragStart(e, o)}
              onDragMove={(e) => handleDragMove(e, o)}
              onDragEnd={() => setGuides([])}
              onTransform={(e) => !multi && handleTransform(e, o)}
              onMouseEnter={(e) => (e.target.getStage().container().style.cursor = 'move')}
              onMouseLeave={(e) => (e.target.getStage().container().style.cursor = 'default')}
            />
          ))}

          {/* outlines of every selected object when several are selected */}
          {multi &&
            selected.map((o) => <Rect key={`o-${o.id}`} x={o.x} y={o.y} width={o.w} height={o.h} rotation={o.rotation} stroke={o.groupId ? '#8b5cf6' : '#00b4d8'} strokeWidth={2 / zoom} dash={[6, 4]} listening={false} />)}

          {only && only.locked && <Rect x={only.x} y={only.y} width={only.w} height={only.h} rotation={only.rotation} stroke="#f59e0b" dash={[8, 6]} strokeWidth={2 / zoom} listening={false} />}

          {/* the invisible box around a multi-selection: this is what the handles resize and rotate */}
          {multi && box && (
            <Rect
              ref={proxyRef}
              x={box.x}
              y={box.y}
              width={box.w}
              height={box.h}
              stroke={groupLocked ? '#f59e0b' : undefined}
              dash={[8, 6]}
              strokeWidth={2 / zoom}
              listening={false}
              onTransformStart={handleGroupTransformStart}
              onTransform={handleGroupTransform}
              onTransformEnd={handleGroupTransformEnd}
            />
          )}

          <Transformer
            ref={transformerRef}
            rotateEnabled
            rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
            anchorSize={10}
            borderStroke={multi ? '#8b5cf6' : '#00b4d8'}
            anchorStroke={multi ? '#8b5cf6' : '#00b4d8'}
            boundBoxFunc={(oldBox, newBox) => (newBox.width < MIN_SIZE * zoom || newBox.height < MIN_SIZE * zoom ? oldBox : newBox)}
          />

          {marquee && (
            <Rect
              x={Math.min(marquee.x0, marquee.x1)}
              y={Math.min(marquee.y0, marquee.y1)}
              width={Math.abs(marquee.x1 - marquee.x0)}
              height={Math.abs(marquee.y1 - marquee.y0)}
              fill="rgba(0,180,216,0.12)"
              stroke="#00b4d8"
              strokeWidth={1 / zoom}
              dash={[6, 4]}
              listening={false}
            />
          )}

          {guides.map((g, i) => (
            <Line key={i} points={g.vertical ? [g.at, 0, g.at, CANVAS_H] : [0, g.at, CANVAS_W, g.at]} stroke="#f43f5e" strokeWidth={1 / zoom} dash={[6, 4]} listening={false} />
          ))}
        </Layer>
      </Stage>
    </div>
  )
}
