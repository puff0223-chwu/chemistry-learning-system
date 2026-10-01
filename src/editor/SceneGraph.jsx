import { useEffect, useMemo, useState } from 'react'
import { Background, Controls, ConnectionMode, Handle, MarkerType, Position, ReactFlow, applyNodeChanges } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { assetUrl } from '../lib/assets.js'
import { DIRECTIONS } from '../lib/missionSchema.js'

function SceneNode({ data }) {
  const { scene, assets, isStart, isCurrent } = data
  const bg = scene.background
  const image = bg?.type === 'image' ? assets[bg.assetId] : null
  return (
    <div className={`w-44 rounded-xl overflow-hidden bg-white shadow border-2 ${isCurrent ? 'border-cyan' : 'border-slate-300'}`}>
      {/* Two lanes per side so a "there" arrow and a "back" arrow never sit on top of each other. */}
      <Handle id="f-in" type="target" position={Position.Left} style={{ top: "30%" }} className="!w-3 !h-3 !bg-cyan" />
      <Handle id="b-out" type="source" position={Position.Left} style={{ top: "75%" }} className="!w-3 !h-3 !bg-slate-400" />
      <div
        className="h-20 bg-cover bg-center"
        style={image ? { backgroundImage: `url("${assetUrl(image.storage_path)}")` } : { background: bg?.type === 'color' ? bg.color : '#1e293b' }}
      />
      <div className="px-2 py-1.5 text-sm">
        <p className="font-bold truncate">{scene.name}</p>
        <p className="text-xs text-slate-500">
          {isStart && <span className="text-emerald-600 font-bold">★ 起始場景 ・ </span>}
          {scene.objects.length} 個物件
        </p>
      </div>
      <Handle id="f-out" type="source" position={Position.Right} style={{ top: "30%" }} className="!w-3 !h-3 !bg-cyan" />
      <Handle id="b-in" type="target" position={Position.Right} style={{ top: "75%" }} className="!w-3 !h-3 !bg-slate-400" />
    </div>
  )
}

const nodeTypes = { scene: SceneNode }

// Scene relation graph (spec-v5 §6.1 / §5.3): one box per scene, one arrow per exit.
// Drag from a box's right dot to another box to create an exit, then pick its direction.
export default function SceneGraph({ scenes, startSceneId, currentSceneId, assets, onOpenScene, onConnectExit, onClearExit, onMoveScene, onAddScene }) {
  const [pending, setPending] = useState(null) // { from, to }
  const [alsoReturn, setAlsoReturn] = useState(true)
  const [nodes, setNodes] = useState([])

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
        DIRECTIONS.filter((d) => s.exits[d.key]).map((d) => {
          const target = scenes.find((t) => t.sceneId === s.exits[d.key])
          const backwards = target && target.graphPos.x < s.graphPos.x // target sits to the left: use the lower, left-facing lane
          return {
          id: `${s.sceneId}:${d.key}`,
          source: s.sceneId,
          target: s.exits[d.key],
          sourceHandle: backwards ? 'b-out' : 'f-out',
          targetHandle: backwards ? 'b-in' : 'f-in',
          label: `${d.arrow} ${d.label}`,
          markerEnd: { type: MarkerType.ArrowClosed },
          style: { strokeWidth: 2 },
          labelBgPadding: [6, 3],
          labelBgBorderRadius: 6,
          }
        }),
      ),
    [scenes],
  )

  function choose(dir) {
    onConnectExit(pending.from, dir, pending.to, alsoReturn)
    setPending(null)
  }

  return (
    <div className="relative w-full h-full bg-slate-50">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        connectionMode={ConnectionMode.Loose}
        fitView
        deleteKeyCode={['Backspace', 'Delete']}
        onNodesChange={(changes) => setNodes((prev) => applyNodeChanges(changes, prev))}
        onNodeDragStop={(_, node) => onMoveScene(node.id, { x: Math.round(node.position.x), y: Math.round(node.position.y) })}
        onNodeDoubleClick={(_, node) => onOpenScene(node.id)}
        onConnect={(c) => c.source !== c.target && setPending({ from: c.source, to: c.target })}
        onEdgesDelete={(deleted) => deleted.forEach((e) => onClearExit(...e.id.split(':')))}
        onPaneClick={() => setPending(null)}
        nodesConnectable
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>

      <div className="absolute top-3 left-3 bg-white/95 border border-slate-200 rounded-xl p-3 text-sm shadow max-w-xs flex flex-col gap-2">
        <p className="font-bold">場景關聯圖</p>
        <p className="text-slate-600">
          從場景右邊的圓點拖到另一個場景，就能建立出口並選方向。點選箭頭按 Delete 可刪除出口。連點兩下場景可進入編輯。
        </p>
        <button type="button" onClick={onAddScene} className="bg-cyan hover:bg-cyan-dark text-white rounded-lg px-3 py-1.5 font-bold">
          ＋ 新增場景
        </button>
      </div>

      {pending && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 z-10">
          <div className="bg-white rounded-2xl p-5 shadow-xl flex flex-col gap-3 w-80">
            <p className="font-bold">
              從「{scenes.find((s) => s.sceneId === pending.from)?.name}」往哪個方向走到「{scenes.find((s) => s.sceneId === pending.to)?.name}」？
            </p>
            <div className="grid grid-cols-3 gap-2">
              {DIRECTIONS.map((d) => {
                const taken = scenes.find((s) => s.sceneId === pending.from)?.exits[d.key]
                return (
                  <button
                    key={d.key}
                    type="button"
                    onClick={() => choose(d.key)}
                    className="rounded-lg border border-slate-300 hover:bg-cyan hover:text-white py-2"
                    title={taken ? '這個方向已有出口，會被取代' : undefined}
                  >
                    {d.arrow} {d.label}
                    {taken && <span className="block text-[10px] opacity-70">會取代</span>}
                  </button>
                )
              })}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={alsoReturn} onChange={(e) => setAlsoReturn(e.target.checked)} />
              同時建立返回的出口（對向方向，已有出口則不動）
            </label>
            <button type="button" onClick={() => setPending(null)} className="bg-slate-100 hover:bg-slate-200 rounded-lg py-1.5">
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

