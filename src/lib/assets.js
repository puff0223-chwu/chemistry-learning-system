import { supabase } from './supabase.js'

export const ASSET_BUCKET = 'mission-assets'

// Limits from spec-v5 §17.1.
export const IMAGE_MAX_SIDE = 1920
export const IMAGE_TARGET_BYTES = 300 * 1024
export const VIDEO_MAX_BYTES = 20 * 1024 * 1024
export const AUDIO_MAX_BYTES = 3 * 1024 * 1024
// GIF / SVG are not converted (WebP would drop the animation / vector), so they get a stricter size cap.
const PASSTHROUGH_IMAGE_MAX_BYTES = 1024 * 1024
// Supabase free plan: 1 GB of file storage. Teacher is reminded from 800 MB.
export const STORAGE_LIMIT_BYTES = 1024 * 1024 * 1024
export const STORAGE_WARN_BYTES = 800 * 1024 * 1024

export const TYPE_LABELS = { image: '圖片', video: '影片', audio: '音訊' }

const CONVERTIBLE_IMAGES = ['image/jpeg', 'image/png', 'image/webp', 'image/bmp']
const PASSTHROUGH_IMAGES = { 'image/gif': 'gif', 'image/svg+xml': 'svg' }
const VIDEO_TYPES = { 'video/mp4': 'mp4', 'video/webm': 'webm' }
const AUDIO_TYPES = { 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/ogg': 'ogg' }

export function formatBytes(bytes) {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

export function assetUrl(path) {
  if (/^(https?:|data:|\/)/.test(path)) return path // already a full URL (e.g. imported or external)
  return supabase.storage.from(ASSET_BUCKET).getPublicUrl(path).data.publicUrl
}

function blobToWebp(canvas, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality))
}

// Resizes to at most 1920px on the long side and re-encodes as WebP, lowering quality (then size)
// until the file is within ~300 KB. Gives up shrinking below 800px so images never turn to mush.
export async function compressImage(file) {
  const bitmap = await createImageBitmap(file)
  try {
    const baseScale = Math.min(1, IMAGE_MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    let best = null
    for (const shrink of [1, 0.85, 0.7, 0.55]) {
      const scale = baseScale * shrink
      const width = Math.max(1, Math.round(bitmap.width * scale))
      const height = Math.max(1, Math.round(bitmap.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height)
      for (const quality of [0.85, 0.75, 0.65, 0.55]) {
        const blob = await blobToWebp(canvas, quality)
        if (!blob || blob.type !== 'image/webp') throw new Error('這個瀏覽器不支援 WebP 壓縮，請改用 Chrome 或 Edge 上傳')
        best = { blob, width, height }
        if (blob.size <= IMAGE_TARGET_BYTES) return best
      }
      if (Math.max(width, height) * 0.85 < 800) break
    }
    return best
  } finally {
    bitmap.close()
  }
}

async function readImageSize(file) {
  try {
    const bitmap = await createImageBitmap(file)
    const size = { width: bitmap.width, height: bitmap.height }
    bitmap.close()
    return size
  } catch {
    return { width: null, height: null }
  }
}

async function shortHash(blob) {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return Array.from(new Uint8Array(digest))
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// Validates the file and turns it into what will actually be stored. Throws a teacher-readable error.
async function prepare(file) {
  const mime = file.type
  if (CONVERTIBLE_IMAGES.includes(mime)) {
    const { blob, width, height } = await compressImage(file)
    return { type: 'image', blob, ext: 'webp', contentType: 'image/webp', width, height }
  }
  if (PASSTHROUGH_IMAGES[mime]) {
    if (file.size > PASSTHROUGH_IMAGE_MAX_BYTES) throw new Error(`${PASSTHROUGH_IMAGES[mime].toUpperCase()} 檔不會自動壓縮，請小於 1 MB`)
    const { width, height } = await readImageSize(file)
    return { type: 'image', blob: file, ext: PASSTHROUGH_IMAGES[mime], contentType: mime, width, height }
  }
  if (VIDEO_TYPES[mime]) {
    if (file.size > VIDEO_MAX_BYTES) throw new Error('影片請小於 20 MB；較長的影片建議改用 YouTube 不公開連結')
    return { type: 'video', blob: file, ext: VIDEO_TYPES[mime], contentType: mime, width: null, height: null }
  }
  if (AUDIO_TYPES[mime]) {
    if (file.size > AUDIO_MAX_BYTES) throw new Error('音訊請小於 3 MB')
    return { type: 'audio', blob: file, ext: AUDIO_TYPES[mime], contentType: mime, width: null, height: null }
  }
  if (mime.startsWith('audio/')) throw new Error('音訊請先轉成 MP3 或 AAC（m4a）再上傳')
  throw new Error('不支援這種檔案；可上傳圖片（JPG、PNG、WebP、GIF、SVG）、影片（MP4、WebM）、音訊（MP3、M4A、AAC）')
}

// Uploads one file. File names carry a content hash, so re-uploading the same picture changes nothing
// and a replaced picture gets a new name (long cache headers never serve a stale image).
// Returns { asset, status: 'uploaded' | 'exists', note? }.
export async function uploadAsset(file, missionId) {
  const prepared = await prepare(file)
  const hash = await shortHash(prepared.blob)
  const path = `${missionId ?? 'shared'}/${hash}.${prepared.ext}`

  const { data: existing, error: findError } = await supabase.from('mission_assets').select('*').eq('storage_path', path).maybeSingle()
  if (findError) throw findError
  if (existing) return { asset: existing, status: 'exists' }

  const { error: uploadError } = await supabase.storage.from(ASSET_BUCKET).upload(path, prepared.blob, {
    contentType: prepared.contentType,
    cacheControl: '31536000',
    upsert: false,
  })
  // "already exists" = an object left over from an earlier failed attempt; reuse it.
  if (uploadError && !/already exists|Duplicate/i.test(uploadError.message)) throw uploadError

  const { data, error: insertError } = await supabase
    .from('mission_assets')
    .insert({
      mission_id: missionId,
      storage_path: path,
      type: prepared.type,
      bytes: prepared.blob.size,
      width: prepared.width,
      height: prepared.height,
      name: file.name,
    })
    .select()
    .single()
  if (insertError) {
    if (!uploadError) await supabase.storage.from(ASSET_BUCKET).remove([path])
    throw insertError
  }
  const note =
    prepared.type === 'image' && prepared.blob.size > IMAGE_TARGET_BYTES ? `壓縮後仍有 ${formatBytes(prepared.blob.size)}，建議換較簡單的圖` : null
  return { asset: data, status: 'uploaded', note }
}

// missionFilter: 'all' | 'shared' | <mission uuid>; type: 'all' | 'image' | 'video' | 'audio'.
// Filtering and paging happen in the database so the list stays fast as assets pile up.
export async function fetchAssetsPage({ page, pageSize, missionFilter, type }) {
  let query = supabase.from('mission_assets').select('*', { count: 'exact' }).order('created_at', { ascending: false })
  if (missionFilter === 'shared') query = query.is('mission_id', null)
  else if (missionFilter !== 'all') query = query.eq('mission_id', missionFilter)
  if (type !== 'all') query = query.eq('type', type)
  const from = page * pageSize
  const { data, error, count } = await query.range(from, from + pageSize - 1)
  if (error) throw error
  return { rows: data ?? [], total: count ?? 0 }
}

// Only mission_id + bytes of every asset, read in chunks (a request returns at most 1000 rows).
export async function fetchUsage() {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('mission_assets').select('mission_id, bytes').range(from, from + 999)
    if (error) throw error
    rows.push(...data)
    if (data.length < 1000) break
  }
  const byMission = new Map()
  let total = 0
  for (const r of rows) {
    total += r.bytes
    byMission.set(r.mission_id, (byMission.get(r.mission_id) ?? 0) + r.bytes)
  }
  return { total, count: rows.length, byMission }
}

// Which of these assets are referenced by a mission (draft or published)? Returns a Set of ids.
export async function fetchAssetsInUse(ids, excludeMissionId = null) {
  if (ids.length === 0) return new Set()
  const { data, error } = await supabase.rpc('mission_assets_in_use', { p_ids: ids, p_exclude_mission: excludeMissionId })
  if (error) throw error
  return new Set(data ?? [])
}

export async function fetchMissionAssets(missionId) {
  const { data, error } = await supabase.from('mission_assets').select('id, storage_path, bytes').eq('mission_id', missionId)
  if (error) throw error
  return data ?? []
}

// Removes the files first, then the records, so a failure never leaves a record pointing at nothing.
export async function deleteAssets(assets) {
  if (assets.length === 0) return
  const { error: storageError } = await supabase.storage.from(ASSET_BUCKET).remove(assets.map((a) => a.storage_path))
  if (storageError) throw storageError
  const { error } = await supabase.from('mission_assets').delete().in('id', assets.map((a) => a.id))
  if (error) throw error
}

// Everything the editor can place: this mission's assets, shared assets, and any asset the draft already
// references (a duplicated mission still points at the original mission's files).
export async function fetchEditorAssets(missionId, referencedIds = []) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('mission_assets')
      .select('*')
      .or(`mission_id.is.null,mission_id.eq.${missionId}`)
      .order('created_at', { ascending: false })
      .range(from, from + 999)
    if (error) throw error
    rows.push(...data)
    if (data.length < 1000) break
  }
  const known = new Set(rows.map((r) => r.id))
  const missing = referencedIds.filter((id) => !known.has(id))
  if (missing.length > 0) {
    const { data, error } = await supabase.from('mission_assets').select('*').in('id', missing)
    if (error) throw error
    rows.push(...data)
  }
  return rows
}
