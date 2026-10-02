import { supabase } from './supabase.js'
import { buildNames, mergeNames } from './missionStats.js'
import { chunk, escapeLike, fetchAllRows, fetchByChunks } from './logQueries.js'

export const EMPTY_MISSION_FILTERS = {
  startDate: '',
  endDate: '',
  missionId: '',
  purpose: '',
  grade: '',
  className: '',
  studentName: '',
}

// 任務下拉選單：所有任務（標題）
export async function listMissionTitles() {
  const { data, error } = await supabase.from('missions').select('id, title').order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

function applyFilters(query, f) {
  let q = query
  if (f.startDate) q = q.gte('started_at', new Date(`${f.startDate}T00:00:00`).toISOString())
  if (f.endDate) q = q.lte('started_at', new Date(`${f.endDate}T23:59:59.999`).toISOString())
  if (f.missionId) q = q.eq('mission_id', f.missionId)
  if (f.purpose) q = q.eq('purpose', f.purpose)
  if (f.grade) q = q.eq('grade', f.grade)
  if (f.className.trim()) q = q.ilike('class_name', `%${escapeLike(f.className)}%`)
  if (f.studentName.trim()) q = q.ilike('student_name', `%${escapeLike(f.studentName)}%`)
  return q
}

// 結果：{ rows: [{ session, logs }], names, titles: Map(mission id -> title) }
export async function queryMissionData(filters) {
  const sessions = await fetchAllRows(() =>
    applyFilters(supabase.from('student_sessions').select('*').eq('mode', 'mission'), filters)
      .order('started_at', { ascending: false })
      .order('id', { ascending: true }),
  )
  const logs = await fetchByChunks(
    sessions.map((s) => s.session_uuid),
    (part) => supabase.from('mission_logs').select('*').in('session_id', part).order('seq', { ascending: true }).order('id', { ascending: true }),
  )
  const bySession = new Map()
  for (const l of logs) {
    if (!bySession.has(l.session_id)) bySession.set(l.session_id, [])
    bySession.get(l.session_id).push(l)
  }

  // 代號 → 名稱：讀這些場次用到的任務（有已發布版本用已發布版本，沒有就用草稿）
  const missionIds = [...new Set(sessions.map((s) => s.mission_id).filter(Boolean))]
  const missionRows = []
  for (const part of chunk(missionIds, 10)) {
    const { data, error } = await supabase.from('missions').select('id, title, published_data, draft_data').in('id', part)
    if (error) throw error
    missionRows.push(...data)
  }
  const titles = new Map(missionRows.map((m) => [m.id, m.title]))
  const names = mergeNames(missionRows.map((m) => buildNames(m.published_data ?? m.draft_data)))

  return { rows: sessions.map((session) => ({ session, logs: bySession.get(session.session_uuid) ?? [] })), names, titles }
}

// 刪除場次就夠了：mission_logs / mission_submissions 都是 ON DELETE CASCADE。
export async function deleteMissionSessions(sessionUuids) {
  let deleted = 0
  for (const part of chunk(sessionUuids, 50)) {
    const { data, error } = await supabase.from('student_sessions').delete().in('session_uuid', part).select('id')
    if (error) throw error
    deleted += data.length
  }
  return deleted
}
