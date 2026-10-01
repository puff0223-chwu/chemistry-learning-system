// Automatic placement for the scene graph: scenes are laid out on a grid following their exits, so a scene that is
// "to the right" of another really sits to its right. Pure function (no React), tested with node.

// Where a neighbour sits, in grid cells. "forward" goes up-right and "backward" down-left, matching the corner
// dots on a scene box in the graph.
export const GRID_STEP = { right: [1, 0], left: [-1, 0], up: [0, -1], down: [0, 1], forward: [1, -1], backward: [-1, 1] }
const ORDER = ['right', 'down', 'left', 'up', 'forward', 'backward']

export function autoLayout(scenes, startSceneId, cell = { w: 280, h: 200 }) {
  const byId = new Map(scenes.map((s) => [s.sceneId, s]))
  const taken = new Map() // "x,y" -> sceneId
  const place = new Map() // sceneId -> [gx, gy]
  const key = (x, y) => `${x},${y}`

  // nearest free cell to the wanted one (spiralling outwards)
  function freeNear(x, y) {
    if (!taken.has(key(x, y))) return [x, y]
    for (let r = 1; r < 12; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) === r && !taken.has(key(x + dx, y + dy))) return [x + dx, y + dy]
        }
      }
    }
    return [x, y]
  }
  const put = (id, x, y) => {
    taken.set(key(x, y), id)
    place.set(id, [x, y])
  }

  const roots = [startSceneId, ...scenes.map((s) => s.sceneId)].filter((id) => byId.has(id))
  let nextRow = 0
  for (const root of roots) {
    if (place.has(root)) continue
    // each unconnected group starts on its own row below everything placed so far
    const [rx, ry] = freeNear(0, nextRow)
    put(root, rx, ry)
    const queue = [root]
    while (queue.length) {
      const id = queue.shift()
      const [x, y] = place.get(id)
      for (const dir of ORDER) {
        const target = byId.get(id).exits[dir]
        if (!target || !byId.has(target) || place.has(target)) continue
        const [dx, dy] = GRID_STEP[dir]
        const [tx, ty] = freeNear(x + dx, y + dy)
        put(target, tx, ty)
        queue.push(target)
      }
    }
    nextRow = Math.max(...[...place.values()].map(([, gy]) => gy)) + 2
  }

  // shift so the top-left scene is at (0, 0)
  const minX = Math.min(...[...place.values()].map(([gx]) => gx))
  const minY = Math.min(...[...place.values()].map(([, gy]) => gy))
  return Object.fromEntries([...place].map(([id, [gx, gy]]) => [id, { x: (gx - minX) * cell.w, y: (gy - minY) * cell.h }]))
}
