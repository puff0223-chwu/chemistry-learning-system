import { useEffect, useMemo, useState } from 'react'
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, ReactFlowProvider, applyNodeChanges, useReactFlow } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { assetUrl } from '../lib/assets.js'
import { DIRECTIONS } from '../lib/missionSchema.js'

// Each direction has its own labelled dot on the edge of a scene box. Dragging from the "→" dot creates a "right"
// exit, from "↑" an "up" exit, and so on, so there is no direction to choose afterwards.
//   OUT: the visible dots you drag from.   IN: invisible landing points where that arrow arrives.
// The IN point of a direction sits on the opposite side of the neighbour and at the same offset as the OUT point
// that feeds it, so a "there" arrow and a "back" arrow run side by side instead of on top of each other.
const OUT = {
  right: { position: Position.Right, style: { top: '30%' }, glyph: '→' },
  left: { position: Position.Left, style: { top: '70%' }, glyph: '←' },
  up: { position: Position.Top, style: { left: '30%' }, glyph: '↑' },
  down: { position: Position.Bottom, style: { left: '70%' }, glyph: '↓' },
  forward: { position: Position.Top, style: { left: '88%' }, glyph: '↗' },
  backward: { position: Position.Bottom, style: { left: '12%' }, glyph: '↙' },
}
const IN = {
  right: { position: Position.Left, style: { top: '30%' } },
  left: { position: Position.Right, style: { top: '70%' } },
  up: { position: Position.Bottom, style: { left: '30%' } },
  down: { position: Position.Top, style: { left: '70%' } },
  forward: { position: Position.Bottom, style: { left: '88%' } },
  backward: { position: Position.Top, style: { left: '12%' } },
}
const invisible = { width: 14, height: 14, background: 'transparent', border: 'none', opacity: 0 }
const label = (key) => DIRECTIONS.find((d) => d.key === key)?.label

function SceneNode({ data }) {
  const { scene, assets, isStart, isCurrent } = data
  const bg = scene.background
  const image = bg?.type === 'image' ? assets[bg.assetId] : null
  return (
    <div className={`relative w-44 rounded-xl bg-white shadow border-2 ${isCurrent ? 'border-cyan' : 'border-slate-300'}`}>
      {/* drop anywhere on the box to connect to this scene */}
      <Handle id="drop" type="target" position={Position.Left} isConnectableStart={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', transform: 'none', background: 'transparent', border: 'none', borderRadius: 12 }} />
      {Object.entries(IN).map(([dir, h]) => (
        <Handle key={`in-${dir}`} id={`${dir}-in`} type="target" position={h.position} isConnectableStart={false} isConnectableEnd={false} style={{ ...invisible, ...h.style }} />
      ))}
      <div className="h-20 bg-cover bg-center rounded-t-[10px]" style={image ? { backgroundImage: `url("${assetUrl(image.storage_path)}")` } : { background: bg?.type === 'color' ? bg.color : '#1e293b' }} />
      <div className="px-2 py-1.5 text-sm">
        <p className="font-bold truncate">{scene.name}</p>
        <p className="text-xs text-slate-500">
          {isStart && <span className="text-emerald-600 font-bold">★ 起始場景 ・ </span>}
          {scene.objects.length} 個物件
        </p>
      </div>
      {Object.entries(OUT).map(([dir, h]) => (
        <Handle
          key={`out-${dir}`}
          id={`${dir}-out`}
          type="source"
          position={h.position}
          isConnectableEnd={false}
          title={`往${label(dir)}的出口：從這裡拖到另一個場景`}
          style={{ ...h.style, width: 20, height: 20, background: scene.exits[dir] ? '#00b4d8' : '#fff', color: scene.exits[dir] ? '#fff' : '#0891b2', border: '2px solid #00b4d8', fontSize: 12, lineHeight: '16px', textAlign: 'center', fontWeight: 700 }}
        >
          <span className="pointer-events-none select-none">{h.glyph}</span>
        </Handle>
      ))}
    </div>
  )
}

const nodeTypes = { scene: SceneNode }

function Graph({ scenes, startSceneId, currentSceneId, assets, onOpenScene, onConnectExit, onClearExit, onMoveScene, onAddScene, onAutoLayout }) {
  const [alsoReturn, setAlsoReturn] = useState(true)
  const [nodes, setNodes] = useState([])
  const { fitView } = useReactFlow()

  // Positions always come from the document (so undo/redo moves boxes too); local state only carries a drag in progress.
  useEffect(() => {
    setNodes(
      scenes.map((s) => ({
        id: s.sceneId,
        type: 'scene',
        position: s.graphPos,
        data: { scene: s, assets, isStart: s.sceneId === startSceneId, isCurrent: s.sceneId === currentSceneId },
      })),
    )
  }, [scenes, assets, startSceneId, currentSceneId])

  const edges = useMemo(
    () =>
      scenes.flatMap((s) =>
        DIRECTIONS.filter((d) => s.exits[d.key]).map((d) => ({
          id: `${s.sceneId}:${d.key}`,
          source: s.sceneId,
          target: s.exits[d.key],
          sourceHandle: `${d.key}-out`,
          targetHandle: `${d.key}-in`,
          type: 'default',
          label: `${d.arrow} ${d.label}`,
          markerEnd: { type: MarkerType.ArrowClosed, color: '#475569' },
          style: { strokeWidth: 2, stroke: '#475569', strokeDasharray: d.key === 'forward' || d.key === 'backward' ? '6 4' : undefined },
          labelStyle: { fontSize: 12, fontWeight: 700 },
          labelBgPadding: [6, 3],
          labelBgBorderRadius: 6,
        })),
      ),
    [scenes],
  )

  function arrange() {
    onAutoLayout()
    setTimeout(() => fitView({ duration: 300, padding: 0.2 }), 350)
  }

  return (
    <div className="relative w-full h-full bg-slate-50">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        deleteKeyCode={['Backspace', 'Delete']}
        onNodesChange={(changes) => setNodes((prev) => applyNodeChanges(changes, prev))}
        onNodeDragStop={(_, node) => onMoveScene(node.id, { x: Math.round(node.position.x), y: Math.round(node.position.y) })}
        onNodeDoubleClick={(_, node) => onOpenScene(node.id)}
        isValidConnection={(c) => c.source !== c.target && !!c.sourceHandle?.endsWith('-out')}
        onConnect={(c) => {
          const dir = c.sourceHandle?.replace('-out', '')
          if (dir && OUT[dir] && c.source !== c.target) onConnectExit(c.source, dir, c.target, alsoReturn)
        }}
        onEdgesDelete={(deleted) => deleted.forEach((e) => onClearExit(...e.id.split(':')))}
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>

      <div className="absolute top-3 left-3 bg-white/95 border border-slate-200 rounded-xl p-3 text-sm shadow max-w-xs flex flex-col gap-2">
        <p className="font-bold">場景關聯圖</p>
        <p className="text-slate-600 leading-relaxed">
          每個場景四周有標了方向的圓點（→ ← ↑ ↓，斜的 ↗ 是「前」、↙ 是「後」）。
          <b>從某個方向的圓點，拖到另一個場景</b>，就建立那個方向的出口。
        </p>
        <p className="text-slate-500 text-xs leading-relaxed">點一條箭頭再按 Delete 可以刪掉出口；連點兩下場景進入編輯；拖動場景可以改位置。</p>
        <label className="flex items-center gap-2 text-slate-700">
          <input type="checkbox" checked={alsoReturn} onChange={(e) => setAlsoReturn(e.target.checked)} />
          同時建立「走回來」的出口
        </label>
        <div className="flex gap-2">
          <button type="button" onClick={onAddScene} className="flex-1 bg-cyan hover:bg-cyan-dark text-white rounded-lg px-3 py-1.5 font-bold">
            ＋ 新增場景
          </button>
          <button type="button" onClick={arrange} title="依照出口的方向，把場景排整齊" className="flex-1 bg-slate-100 hover:bg-slate-200 rounded-lg px-3 py-1.5 font-bold">
            🧹 自動整理
          </button>
        </div>
      </div>
    </div>
  )
}

// Scene relation graph (spec-v5 §6.1 / §5.3): one box per scene, one arrow per exit.
export default function SceneGraph(props) {
  return (
    <ReactFlowProvider>
      <Graph {...props} />
    </ReactFlowProvider>
  )
}
