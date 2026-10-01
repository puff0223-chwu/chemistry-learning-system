import { useEffect, useMemo, useState } from 'react'
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, ReactFlowProvider, applyNodeChanges, useReactFlow } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { describeCondition, isEmptyCondition } from '../lib/missionEvents.js'
import { layoutStages } from './graphLayout.js'
import { ConditionEditor } from './EventEditor.jsx'

// One card per stage. Drag from the dot on its right edge to another stage to say "after this one, that one opens".
function StageNode({ data }) {
  const { stage, incoming, isCurrent, onOpen, onSettings, onDuplicate, onDelete, canDelete, onJoin } = data
  const goals = (stage.objectives ?? []).length
  return (
    <div className={`relative w-56 rounded-xl bg-white shadow border-2 ${isCurrent ? 'border-cyan' : 'border-slate-300'}`}>
      <Handle id="drop" type="target" position={Position.Left} isConnectableStart={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', transform: 'none', background: 'transparent', border: 'none', borderRadius: 12 }} />
      <Handle id="in" type="target" position={Position.Left} isConnectableStart={false} isConnectableEnd={false} style={{ width: 10, height: 10, opacity: 0 }} />
      <div className="px-3 pt-2 pb-1 flex items-start gap-1">
        <div className="min-w-0 flex-1">
          <p className="font-bold truncate" title={stage.title}>
            {incoming === 0 && <span title="沒有任何關卡連到它：一開始就能玩">🚩 </span>}
            {stage.title}
          </p>
          <p className="text-xs text-slate-500">
            {stage.scenes.length} 個場景・{goals} 個目標
          </p>
        </div>
        <div className="nodrag flex gap-0.5 text-sm">
          <button type="button" onClick={onSettings} title="關卡設定（開場說明、任務目標、過關方式）" className="px-1 rounded hover:bg-slate-100">⚙</button>
          <button type="button" onClick={onDuplicate} title="複製這一關" className="px-1 rounded hover:bg-slate-100">⧉</button>
          <button type="button" disabled={!canDelete} onClick={onDelete} title={canDelete ? '刪除這一關' : '至少要保留一關'} className="px-1 rounded hover:bg-red-100 text-red-600 disabled:opacity-30">🗑</button>
        </div>
      </div>
      <div className="px-3 pb-2 flex flex-col gap-1">
        {incoming >= 2 && (
          <label className="nodrag text-xs flex items-center gap-1 text-slate-600">
            有多條路連進來：
            <select value={stage.join ?? 'all'} onChange={(e) => onJoin(e.target.value)} className="bg-white border border-slate-300 rounded px-1 py-0.5">
              <option value="all">全部完成才開</option>
              <option value="any">任一條完成就開</option>
            </select>
          </label>
        )}
        <button type="button" onClick={onOpen} className="nodrag bg-cyan/10 hover:bg-cyan/20 text-navy rounded-lg py-1 text-sm font-bold">
          ✏️ 編輯這一關
        </button>
      </div>
      <Handle id="out" type="source" position={Position.Right} isConnectableEnd={false} title="從這裡拖到另一關：這一關完成後，另一關才開放" style={{ width: 22, height: 22, background: '#fff', border: '2px solid #00b4d8', color: '#0891b2', fontWeight: 700, textAlign: 'center', lineHeight: '18px', fontSize: 13 }}>
        <span className="pointer-events-none select-none">→</span>
      </Handle>
    </div>
  )
}

const nodeTypes = { stage: StageNode }

function Map({ draft, stage, ctx, actions, onOpenStage, onEditSettings }) {
  const [selectedLinkId, setSelectedLinkId] = useState(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [nodes, setNodes] = useState([])
  const { fitView } = useReactFlow()
  const stages = draft.stages
  const links = draft.stageLinks ?? []
  const titleOf = (id) => stages.find((s) => s.stageId === id)?.title ?? '？'

  useEffect(() => {
    setNodes(
      stages.map((st) => ({
        id: st.stageId,
        type: 'stage',
        position: st.graphPos ?? { x: 0, y: 0 },
        data: {
          stage: st,
          incoming: links.filter((l) => l.to === st.stageId).length,
          isCurrent: st.stageId === stage.stageId,
          canDelete: stages.length > 1,
          onOpen: () => onOpenStage(st.stageId),
          onSettings: () => onEditSettings(st.stageId),
          onDuplicate: () => actions.duplicateStage(st.stageId),
          onDelete: () => actions.deleteStage(st.stageId),
          onJoin: (join) => actions.updateStageById(st.stageId, { join }, { important: true }),
        },
      })),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.stages, draft.stageLinks, stage.stageId])

  const edges = useMemo(
    () =>
      links.map((l) => ({
        id: l.id,
        source: l.from,
        target: l.to,
        sourceHandle: 'out',
        targetHandle: 'in',
        label: isEmptyCondition(l.when) ? '' : '🔀 有條件',
        selected: l.id === selectedLinkId,
        markerEnd: { type: MarkerType.ArrowClosed, color: l.id === selectedLinkId ? '#00b4d8' : '#475569' },
        style: { strokeWidth: 2.5, stroke: l.id === selectedLinkId ? '#00b4d8' : '#475569', strokeDasharray: isEmptyCondition(l.when) ? undefined : '6 4' },
        labelStyle: { fontSize: 12, fontWeight: 700 },
        labelBgPadding: [6, 3],
        labelBgBorderRadius: 6,
      })),
    [links, selectedLinkId],
  )
  const selectedLink = links.find((l) => l.id === selectedLinkId)

  function arrange() {
    actions.setStagePositions(layoutStages(stages, links))
    setTimeout(() => fitView({ duration: 300, padding: 0.25 }), 350)
  }

  const settings = draft.settings
  return (
    <div className="relative w-full h-full bg-slate-50">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        deleteKeyCode={['Backspace', 'Delete']}
        onNodesChange={(changes) => setNodes((prev) => applyNodeChanges(changes, prev))}
        onNodeDragStop={(_, node) => actions.setStageGraphPos(node.id, { x: Math.round(node.position.x), y: Math.round(node.position.y) })}
        onNodeDoubleClick={(_, node) => onOpenStage(node.id)}
        isValidConnection={(c) => c.source !== c.target}
        onConnect={(c) => {
          if (c.source !== c.target) actions.addLink(c.source, c.target)
        }}
        onEdgeClick={(_, edge) => setSelectedLinkId(edge.id)}
        onPaneClick={() => setSelectedLinkId(null)}
        onEdgesDelete={(deleted) => deleted.forEach((e) => actions.removeLink(e.id))}
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>

      <div className="absolute top-2 left-2 z-10 flex flex-col items-start gap-1.5">
        <div className="flex flex-wrap items-center gap-1.5 bg-white/95 border border-slate-200 rounded-xl shadow px-1.5 py-1 text-sm max-w-[calc(100vw-40rem)]">
          <button type="button" onClick={actions.addStage} className="bg-cyan hover:bg-cyan-dark text-white rounded-lg px-3 py-1 font-bold whitespace-nowrap">
            ＋ 新增關卡
          </button>
          <button type="button" onClick={arrange} className="bg-slate-100 hover:bg-slate-200 rounded-lg px-3 py-1 font-bold whitespace-nowrap">
            🧹 自動整理
          </button>
          <label className="flex items-center gap-1.5 px-1 whitespace-nowrap cursor-pointer" title="學生的關卡地圖上，還沒解鎖的關卡完全不顯示（增加神祕感）">
            <input type="checkbox" checked={!!settings.hideLockedStages} onChange={(e) => actions.updateSettings({ hideLockedStages: e.target.checked })} />
            隱藏還沒解鎖的關卡
          </label>
          <label className="flex items-center gap-1.5 px-1 whitespace-nowrap cursor-pointer" title="學生過完一關後，如果下一關只有一個，就直接帶他進去（不回到地圖）">
            <input type="checkbox" checked={!!settings.autoNextStage} onChange={(e) => actions.updateSettings({ autoNextStage: e.target.checked })} />
            過關後自動進下一關
          </label>
          <button type="button" onClick={() => setHelpOpen((o) => !o)} aria-label="怎麼用" className={`w-8 h-8 rounded-lg font-bold ${helpOpen ? 'bg-navy text-white' : 'bg-slate-100 hover:bg-slate-200'}`}>
            ？
          </button>
        </div>
        {helpOpen && (
          <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-sm w-96 leading-relaxed">
            <p className="font-bold mb-1">關卡怎麼安排？</p>
            <ul className="list-disc ml-4 flex flex-col gap-1 text-slate-700">
              <li><b>一條線</b>：第一關 → 第二關 → 第三關。完成前一關才開下一關。</li>
              <li><b>同時開放</b>：一關連到好幾關（不設條件），學生可以自己選順序。</li>
              <li><b>分支</b>：一關連到好幾關，各自設「條件」，學生做了什麼選擇就走哪一關（可以做出不同結局）。</li>
              <li><b>匯合</b>：好幾關連到同一關，在那一關上選「全部完成才開」或「任一條完成就開」。</li>
            </ul>
            <p className="text-xs text-slate-500 mt-2">連線：從關卡卡片右邊的 → 圓點拖到另一關。點一條線可以設條件或刪除；🚩 表示沒有任何關卡連到它，一開始就能玩。</p>
            <button type="button" onClick={() => setHelpOpen(false)} className="mt-2 text-xs text-cyan-dark underline">知道了</button>
          </div>
        )}
      </div>

      {selectedLink && (
        <div className="absolute bottom-3 left-3 z-10 w-96 max-h-[70%] overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg p-3 flex flex-col gap-2 text-sm">
          <div className="flex items-start justify-between gap-2">
            <p className="font-bold">
              「{titleOf(selectedLink.from)}」完成後 → 開放「{titleOf(selectedLink.to)}」
            </p>
            <button type="button" onClick={() => setSelectedLinkId(null)} aria-label="關閉" className="text-slate-400 hover:text-navy">✕</button>
          </div>
          <p className="text-xs text-slate-500">不設條件＝完成就開。設了條件，要完成「而且」條件成立才開（用來做分支）。</p>
          <ConditionEditor
            value={selectedLink.when ?? null}
            onChange={(v) => actions.updateLink(selectedLink.id, { when: v ?? undefined }, { key: `link-${selectedLink.id}` })}
            ctx={ctx}
            emptyHint="沒有條件：一定會開放。"
          />
          {!isEmptyCondition(selectedLink.when) && <p className="text-xs text-slate-600">意思：完成「{titleOf(selectedLink.from)}」，而且{describeCondition(selectedLink.when, ctx)}，才會開放。</p>}
          <button type="button" onClick={() => { actions.removeLink(selectedLink.id); setSelectedLinkId(null) }} className="self-start bg-red-50 hover:bg-red-100 text-red-700 rounded-lg px-3 py-1.5">
            刪除這條連線
          </button>
        </div>
      )}
    </div>
  )
}

export default function StageMap(props) {
  return (
    <ReactFlowProvider>
      <Map {...props} />
    </ReactFlowProvider>
  )
}
