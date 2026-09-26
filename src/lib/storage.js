import { supabase } from './supabase.js'

export const IMAGE_BUCKET = 'question-images'
export const BACKGROUND_BUCKET = 'site-backgrounds'
const MAX_BYTES = 8 * 1024 * 1024

// Uploads an image under a generated, ASCII-only file name (original names may contain characters
// that storage keys reject) and returns its public URL.
export async function uploadImage(bucket, file, prefix = '') {
  if (!file.type.startsWith('image/')) throw new Error('只能上傳圖片檔案')
  if (file.size > MAX_BYTES) throw new Error('圖片大小請小於 8 MB')
  const ext = (file.name.split('.').pop() ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'png'
  const path = `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    contentType: file.type,
    cacheControl: '31536000',
  })
  if (error) throw error
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
}

// Best effort: removes an object we uploaded earlier, given its public URL.
export async function removeByUrl(bucket, url) {
  const marker = `/${bucket}/`
  const index = url?.indexOf(marker) ?? -1
  if (index < 0) return
  const path = decodeURIComponent(url.slice(index + marker.length).split('?')[0])
  const { error } = await supabase.storage.from(bucket).remove([path])
  if (error) console.error('[storage] 刪除舊檔案失敗：', error.message)
}
