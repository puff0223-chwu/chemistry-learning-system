import { assetUrl } from '../lib/assets.js'

const TIMEOUT_MS = 15000
const CONCURRENCY = 6

// Warms the browser cache for one asset. Always resolves (a missing or slow file must never block the game;
// the scene shows a placeholder instead). Resolves true if the file loaded.
function loadOne(asset) {
  const url = assetUrl(asset.storage_path)
  return new Promise((resolve) => {
    const finish = (ok) => {
      clearTimeout(timer)
      resolve(ok)
    }
    const timer = setTimeout(() => finish(false), TIMEOUT_MS)
    if (asset.type === 'image') {
      const img = new Image()
      img.onload = () => finish(true)
      img.onerror = () => finish(false)
      img.src = url
    } else if (asset.type === 'video') {
      const video = document.createElement('video')
      video.preload = 'metadata'
      video.onloadedmetadata = () => finish(true)
      video.onerror = () => finish(false)
      video.src = url
    } else {
      fetch(url)
        .then((r) => r.blob().then(() => finish(r.ok)))
        .catch(() => finish(false))
    }
  })
}

// Loads every asset (a few at a time) and reports progress. Returns how many failed.
export async function preloadAssets(assets, onProgress) {
  let done = 0
  let failed = 0
  const queue = [...assets]
  onProgress?.(0, assets.length)
  async function worker() {
    while (queue.length > 0) {
      const asset = queue.shift()
      if (!(await loadOne(asset))) failed += 1
      done += 1
      onProgress?.(done, assets.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, assets.length) }, worker))
  return failed
}
