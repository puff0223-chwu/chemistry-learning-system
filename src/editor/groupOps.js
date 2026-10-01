// Multi-select and layer groups (spec-v5 §6.3), as pure functions over a scene's `objects` and `groups`.
// A group is a name in scene.groups plus a `groupId` on each member object. Members are kept next to each
// other in the objects array (= layer order), so a group behaves like one thing in the layer list.
// No React and no Supabase in here, so every rule can be tested directly with node.

const rid = (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 8)}`

export const membersOf = (objects, groupId) => objects.filter((o) => o.groupId === groupId)

// Keeps scene.groups honest: a group with no members left disappears, members of a missing group are freed.
export function pruneGroups(scene) {
  const used = new Set(scene.objects.map((o) => o.groupId).filter(Boolean))
  const groups = (scene.groups ?? []).filter((g) => used.has(g.id))
  const known = new Set(groups.map((g) => g.id))
  const objects = scene.objects.map((o) => (o.groupId && !known.has(o.groupId) ? { ...o, groupId: undefined } : o))
  return { ...scene, objects, groups }
}

// What a click selects. Clicking a member selects its whole group, unless `single` (Alt-click, or picking from
// the layer list). `additive` (Shift) toggles instead of replacing. Returns the new list of selected ids.
export function nextSelection(scene, current, id, { additive = false, single = false } = {}) {
  if (!id) return additive ? current : []
  const target = scene.objects.find((o) => o.id === id)
  if (!target) return current
  const ids = !single && target.groupId ? membersOf(scene.objects, target.groupId).map((o) => o.id) : [id]
  if (!additive) return ids
  const allIn = ids.every((x) => current.includes(x))
  return allIn ? current.filter((x) => !ids.includes(x)) : [...new Set([...current, ...ids])]
}

// If the selection is exactly one whole group, returns that group's id (otherwise null).
export function wholeGroupSelected(scene, selected) {
  const first = scene.objects.find((o) => o.id === selected[0])
  if (!first?.groupId) return null
  const members = membersOf(scene.objects, first.groupId)
  return members.length === selected.length && members.every((m) => selected.includes(m.id)) ? first.groupId : null
}

// Puts the selected objects into one new group (taking them out of any old group) and makes them neighbours,
// placed where the top-most of them was.
export function groupObjects(scene, ids, name) {
  if (ids.length < 2) return { scene, groupId: null }
  const picked = new Set(ids)
  const groupId = rid('gr')
  const topIndex = Math.max(...scene.objects.map((o, i) => (picked.has(o.id) ? i : -1)))
  const block = scene.objects.filter((o) => picked.has(o.id)).map((o) => ({ ...o, groupId }))
  const rest = scene.objects.filter((o) => !picked.has(o.id))
  const insertAt = scene.objects.slice(0, topIndex + 1).filter((o) => !picked.has(o.id)).length
  const objects = [...rest.slice(0, insertAt), ...block, ...rest.slice(insertAt)]
  const groups = [...(scene.groups ?? []), { id: groupId, name: name || '群組' }]
  return { scene: pruneGroups({ ...scene, objects, groups }), groupId }
}

export function ungroup(scene, groupId) {
  return pruneGroups({ ...scene, objects: scene.objects.map((o) => (o.groupId === groupId ? { ...o, groupId: undefined } : o)), groups: (scene.groups ?? []).filter((g) => g.id !== groupId) })
}

export const renameGroup = (scene, groupId, name) => ({ ...scene, groups: (scene.groups ?? []).map((g) => (g.id === groupId ? { ...g, name } : g)) })

export function deleteObjects(scene, ids) {
  const gone = new Set(ids)
  return pruneGroups({ ...scene, objects: scene.objects.filter((o) => !gone.has(o.id)) })
}

// Copies the objects (a copied group becomes a new group). The copies sit on top, nudged so they can be seen.
export function duplicateObjects(scene, ids, offset = 30) {
  const picked = new Set(ids)
  const sources = scene.objects.filter((o) => picked.has(o.id))
  const groupMap = new Map()
  const newGroups = []
  const copies = sources.map((o) => {
    let groupId
    if (o.groupId) {
      if (!groupMap.has(o.groupId)) {
        const old = (scene.groups ?? []).find((g) => g.id === o.groupId)
        const id = rid('gr')
        groupMap.set(o.groupId, id)
        newGroups.push({ id, name: `${old?.name ?? '群組'}（副本）` })
      }
      groupId = groupMap.get(o.groupId)
    }
    return { ...structuredClone(o), id: rid('ob'), name: `${o.name}（副本）`, x: o.x + offset, y: o.y + offset, groupId }
  })
  return { scene: { ...scene, objects: [...scene.objects, ...copies], groups: [...(scene.groups ?? []), ...newGroups] }, newIds: copies.map((c) => c.id) }
}

// Moves a block of objects in the layer order. where: 'up' | 'down' (one step) | 'top' | 'bottom'.
// "up" means closer to the viewer = later in the array. The block keeps its inner order.
export function moveBlock(objects, ids, where) {
  const picked = new Set(ids)
  const firstIndex = objects.findIndex((o) => picked.has(o.id))
  if (firstIndex < 0) return objects
  const block = objects.filter((o) => picked.has(o.id))
  const rest = objects.filter((o) => !picked.has(o.id))
  const at = where === 'top' ? rest.length : where === 'bottom' ? 0 : where === 'up' ? Math.min(firstIndex + 1, rest.length) : Math.max(firstIndex - 1, 0)
  return [...rest.slice(0, at), ...block, ...rest.slice(at)]
}

// ---------------------------------------------------------------- geometry of a selection

const corners = (o) => {
  const r = ((o.rotation ?? 0) * Math.PI) / 180
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  // objects rotate around their top-left corner
  return [
    [0, 0],
    [o.w, 0],
    [o.w, o.h],
    [0, o.h],
  ].map(([dx, dy]) => ({ x: o.x + dx * cos - dy * sin, y: o.y + dx * sin + dy * cos }))
}

// The smallest upright rectangle that holds all the objects (rotated ones included).
export function selectionBounds(objects) {
  const pts = objects.flatMap(corners)
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}

// Which objects does a drag-rectangle (marquee) touch? Compares with each object's upright bounds.
export function objectsInRect(objects, rect) {
  return objects.filter((o) => {
    const b = selectionBounds([o])
    return b.x < rect.x + rect.w && b.x + b.w > rect.x && b.y < rect.y + rect.h && b.y + b.h > rect.y
  })
}

// While a group box is being resized/rotated, works out each member's new place from where it started.
// `start` = the box when the gesture began, `now` = the box now ({ x, y, w, h, rotation }).
// Each member's pivot (top-left) is carried through the same scale-then-rotate-then-move as the box.
export function transformMembers(starts, start, now) {
  const sx = now.w / start.w
  const sy = now.h / start.h
  const r = ((now.rotation ?? 0) * Math.PI) / 180
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  return starts.map((o) => {
    const px = (o.x - start.x) * sx
    const py = (o.y - start.y) * sy
    return {
      id: o.id,
      patch: {
        x: Math.round((now.x + px * cos - py * sin) * 10) / 10,
        y: Math.round((now.y + px * sin + py * cos) * 10) / 10,
        w: Math.max(12, Math.round(o.w * sx * 10) / 10),
        h: Math.max(12, Math.round(o.h * sy * 10) / 10),
        rotation: Math.round(((o.rotation ?? 0) + (now.rotation ?? 0)) * 10) / 10,
      },
    }
  })
}

// Give a duplicated scene its own group ids (so "show group" in one scene never reaches the other).
export function regroupForCopy(scene) {
  const map = new Map((scene.groups ?? []).map((g) => [g.id, rid('gr')]))
  return {
    ...scene,
    groups: (scene.groups ?? []).map((g) => ({ ...g, id: map.get(g.id) })),
    objects: scene.objects.map((o) => (o.groupId ? { ...o, groupId: map.get(o.groupId) } : o)),
  }
}
