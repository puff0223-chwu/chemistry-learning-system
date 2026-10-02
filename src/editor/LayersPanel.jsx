import { useState } from 'react'
import { OBJECT_TYPE_LABELS } from '../lib/missionSchema.js'
import { membersOf, wholeGroupSelected } from './groupOps.js'

// What an object can do, as little icons: ⚡ reacts to clicks, ⏳ not always visible.
export const interactionBadges = (o) => `${o.onClick?.length ? '⚡' : ''}${o.showWhen || o.visible === false ? '⏳' : ''}${o.collectible ? '🎒' : ''}${o.moveInScene ? '✋' : ''}`

const iconButton = 'px-1 hover:bg-slate-200 rounded'

function BlockControls({ ids, actions, extra }) {
  return (
    <span className="flex gap-0.5 text-xs">
      <button type="button" title="移到最上面" onClick={() => actions.moveLayer(ids, 'top')} className={iconButton}>⤒</button>
      <button type="button" title="上移一層" onClick={() => actions.moveLayer(ids, 'up')} className={iconButton}>↑</button>
      <button type="button" title="下移一層" onClick={() => actions.moveLayer(ids, 'down')} className={iconButton}>↓</button>
      <button type="button" title="移到最下面" onClick={() => actions.moveLayer(ids, 'bottom')} className={iconButton}>⤓</button>
      <button type="button" title="複製（Ctrl+D）" onClick={() => actions.duplicateObjects(ids)} className={iconButton}>⧉</button>
      {extra}
      <button type="button" title="刪除（Delete）" onClick={() => actions.deleteObjects(ids)} className="px-1 hover:bg-red-100 text-red-600 rounded">🗑</button>
    </span>
  )
}

function ObjectRow({ o, indent, selectedIds, actions }) {
  const on = selectedIds.includes(o.id)
  return (
    <li
      onContextMenu={(e) => {
        e.preventDefault()
        actions.openObjectMenu(e.clientX, e.clientY, selectedIds.includes(o.id) ? selectedIds : [o.id])
      }}
      className={`flex items-center gap-1 rounded-lg px-1.5 py-1 text-sm ${indent ? 'ml-5' : ''} ${on ? 'bg-cyan/15 ring-1 ring-cyan' : 'hover:bg-slate-100'}`}
    >
      <button type="button" title={o.visible ? '一開始會顯示，按一下改成「一開始看不到」' : '一開始看不到，按一下改成顯示'} onClick={() => actions.updateObject(o.id, { visible: !o.visible })} className="w-6">
        {o.visible ? '👁️' : '🚫'}
      </button>
      <button type="button" title={o.locked ? '已鎖定（畫布上點不到）' : '鎖定，避免誤拖'} onClick={() => actions.updateObject(o.id, { locked: !o.locked })} className="w-6">
        {o.locked ? '🔒' : '🔓'}
      </button>
      <button type="button" onClick={(e) => actions.selectObject(o.id, { single: true, additive: e.shiftKey || e.ctrlKey || e.metaKey })} className="flex-1 min-w-0 text-left truncate">
        {o.name}
        <span className="text-[11px] text-slate-400"> {OBJECT_TYPE_LABELS[o.type]}</span>
        <span className="text-[11px]" title="⚡ 點擊有事件　⏳ 有出現條件或一開始隱藏　🎒 可以撿起　✋ 可以拖開">
          {' '}
          {interactionBadges(o)}
        </span>
      </button>
      {on && selectedIds.length === 1 && <BlockControls ids={[o.id]} actions={actions} />}
    </li>
  )
}

function GroupRow({ group, members, collapsed, onToggle, selectedIds, actions }) {
  const ids = members.map((m) => m.id)
  const on = ids.every((id) => selectedIds.includes(id))
  const allShown = members.every((m) => m.visible)
  const allLocked = members.every((m) => m.locked)
  return (
    <li
      onContextMenu={(e) => {
        e.preventDefault()
        actions.openObjectMenu(e.clientX, e.clientY, ids)
      }}
      className={`flex items-center gap-1 rounded-lg px-1.5 py-1 text-sm bg-violet-50 ${on ? 'ring-1 ring-violet-400' : 'hover:bg-violet-100'}`}
    >
      <button type="button" onClick={onToggle} aria-label={collapsed ? '展開群組' : '收合群組'} className="w-5 text-xs">
        {collapsed ? '▸' : '▾'}
      </button>
      <button type="button" title={allShown ? '整組一開始會顯示，按一下整組改成「一開始看不到」' : '整組一開始看不到，按一下整組改成顯示'} onClick={() => actions.updateObjects(members.map((m) => ({ id: m.id, patch: { visible: !allShown } })), { important: true })} className="w-6">
        {allShown ? '👁️' : '🚫'}
      </button>
      <button type="button" title={allLocked ? '整組已鎖定' : '整組鎖定，避免誤拖'} onClick={() => actions.updateObjects(members.map((m) => ({ id: m.id, patch: { locked: !allLocked } })), { important: true })} className="w-6">
        {allLocked ? '🔒' : '🔓'}
      </button>
      <button type="button" onClick={(e) => actions.selectObjects(e.shiftKey ? [...new Set([...selectedIds, ...ids])] : ids)} className="flex-1 min-w-0 text-left truncate font-bold">
        🗂 {group.name} <span className="text-[11px] font-normal text-slate-500">（{members.length} 個）</span>
      </button>
      {on && (
        <BlockControls
          ids={ids}
          actions={actions}
          extra={
            <button type="button" title="解散群組（物件保留，只是不再綁在一起）" onClick={() => actions.ungroup(group.id)} className={iconButton}>
              🔓
            </button>
          }
        />
      )}
    </li>
  )
}

// The layer list (top-most first). Groups show as folders; their members sit inside, and the whole thing moves
// as one block. A plain click on a member picks just that member, so one thing in a group can still be edited.
export default function LayersPanel({ scene, selectedIds, actions }) {
  const [collapsed, setCollapsed] = useState(() => new Set())
  const toggle = (id) =>
    setCollapsed((cur) => {
      const next = new Set(cur)
      if (!next.delete(id)) next.add(id)
      return next
    })

  const rows = []
  const seen = new Set()
  for (const o of [...scene.objects].reverse()) {
    if (!o.groupId) {
      rows.push({ kind: 'object', o })
      continue
    }
    if (seen.has(o.groupId)) continue
    seen.add(o.groupId)
    const group = (scene.groups ?? []).find((g) => g.id === o.groupId) ?? { id: o.groupId, name: '群組' }
    const members = membersOf(scene.objects, group.id).reverse()
    rows.push({ kind: 'group', group, members })
    if (!collapsed.has(group.id)) for (const m of members) rows.push({ kind: 'object', o: m, indent: true })
  }

  return (
    <section className="border-b border-slate-200 p-3 flex flex-col gap-2 max-h-64 min-h-[110px]">
      <h2 className="font-bold text-sm">圖層（上面的蓋住下面的）</h2>
      {scene.objects.length === 0 && <p className="text-xs text-slate-400">這個場景還沒有物件。</p>}
      <ul className="overflow-y-auto flex flex-col gap-1">
        {rows.map((r) =>
          r.kind === 'group' ? (
            <GroupRow key={`g-${r.group.id}`} group={r.group} members={r.members} collapsed={collapsed.has(r.group.id)} onToggle={() => toggle(r.group.id)} selectedIds={selectedIds} actions={actions} />
          ) : (
            <ObjectRow key={r.o.id} o={r.o} indent={r.indent} selectedIds={selectedIds} actions={actions} />
          ),
        )}
      </ul>
    </section>
  )
}

// Shown in the properties area when more than one object is selected (or exactly one whole group).
export function SelectionPanel({ scene, selectedIds, actions }) {
  const groupId = wholeGroupSelected(scene, selectedIds)
  const group = groupId ? (scene.groups ?? []).find((g) => g.id === groupId) : null
  const button = 'rounded-lg px-3 py-2 text-sm font-bold'
  return (
    <div className="flex flex-col gap-3">
      {group ? (
        <>
          <h3 className="font-bold">🗂 群組（{selectedIds.length} 個物件）</h3>
          <label className="flex flex-col gap-0.5">
            <span className="text-xs text-slate-500">群組名稱（事件裡選「整個群組」時會看到這個名字）</span>
            <input value={group.name} onChange={(e) => actions.renameGroup(group.id, e.target.value)} className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-sm" />
          </label>
          <p className="text-xs text-slate-600 bg-violet-50 rounded-lg p-2 leading-relaxed">
            群組裡的東西會一起移動、縮放、旋轉；在圖層裡可以一次鎖定、隱藏。
            <br />
            在「點擊時」的步驟裡選「讓東西出現／消失」，目標可以選「整個群組」，一次處理全部。
            <br />
            想修改其中一個物件，請到上面的圖層列表點它（或在畫布上按住 Alt 點它）。
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => actions.ungroup(group.id)} className={`${button} bg-violet-100 hover:bg-violet-200 text-violet-900`}>
              解散群組
            </button>
            <button type="button" onClick={() => actions.duplicateObjects(selectedIds)} className={`${button} bg-slate-100 hover:bg-slate-200`}>
              複製整組
            </button>
            <button type="button" onClick={() => actions.deleteObjects(selectedIds)} className={`${button} bg-red-50 hover:bg-red-100 text-red-700`}>
              刪除整組
            </button>
          </div>
        </>
      ) : (
        <>
          <h3 className="font-bold">已選取 {selectedIds.length} 個物件</h3>
          <button type="button" onClick={actions.groupSelected} className={`${button} bg-violet-600 hover:bg-violet-500 text-white`}>
            🗂 組成群組（Ctrl+G）
          </button>
          <p className="text-xs text-slate-600 bg-slate-50 rounded-lg p-2 leading-relaxed">
            組成群組後，它們會一起移動、縮放，也能一次顯示或隱藏（例如答對後讓整批寶物出現）。
            <br />
            小技巧：按住 Shift 點物件可以加選；在空白處拖曳可以框選。
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => actions.duplicateObjects(selectedIds)} className={`${button} bg-slate-100 hover:bg-slate-200`}>
              複製
            </button>
            <button type="button" onClick={() => actions.deleteObjects(selectedIds)} className={`${button} bg-red-50 hover:bg-red-100 text-red-700`}>
              刪除
            </button>
          </div>
        </>
      )}
    </div>
  )
}
