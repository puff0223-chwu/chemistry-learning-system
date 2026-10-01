import { supabase } from './supabase.js'

export const STATUS_LABELS = {
  draft: '草稿',
  published: '已發布',
  archived: '已封存',
}

// Skeleton of a brand-new mission (spec-v5 §4.2). Real content is added by the editor in later phases.
export function emptyMissionData() {
  return {
    schemaVersion: 1,
    settings: {
      timeLimitSeconds: null,
      backgroundMusic: null,
      notebookCategories: ['現場觀察', '證物特徵', '計算結果'],
      labCategories: ['物理鑑定', '化學鑑定', '生物科技鑑定', '一般觀察'],
      giveUpDefault: { enabled: true, afterAttempts: 3 },
    },
    flags: {},
    items: [],
    stages: [],
    stageLinks: [],
    finalChallenge: null,
  }
}

// The list never downloads draft_data / published_data: they get large once the editor exists.
const LIST_COLUMNS = 'id, title, category_id, cover_url, status, is_open, published_version, published_at, created_at, updated_at'

export async function fetchCategories() {
  const { data, error } = await supabase
    .from('mission_categories')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function fetchMissions() {
  const { data, error } = await supabase.from('missions').select(LIST_COLUMNS).order('updated_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function createMission({ title, categoryId }) {
  const { error } = await supabase.from('missions').insert({
    title,
    category_id: categoryId,
    draft_data: emptyMissionData(),
  })
  if (error) throw error
}

export async function updateMissionInfo(id, { title, categoryId }) {
  const { error } = await supabase.from('missions').update({ title, category_id: categoryId }).eq('id', id)
  if (error) throw error
}

// A copy starts as an unpublished draft; only the draft content is carried over.
export async function duplicateMission(id) {
  const { data, error } = await supabase
    .from('missions')
    .select('title, category_id, cover_url, draft_data')
    .eq('id', id)
    .single()
  if (error) throw error
  const { error: insertError } = await supabase.from('missions').insert({
    title: `${data.title}（副本）`,
    category_id: data.category_id,
    cover_url: data.cover_url,
    draft_data: data.draft_data,
  })
  if (insertError) throw insertError
}

export async function deleteMission(id) {
  const { error } = await supabase.from('missions').delete().eq('id', id)
  if (error) throw error
}

// Copies the draft over the published version and bumps the version number. is_open is left as it is,
// so publishing never opens a mission to students by itself.
export async function publishMission(id) {
  const { data, error } = await supabase.from('missions').select('draft_data, published_version').eq('id', id).single()
  if (error) throw error
  const version = data.published_version + 1
  const { error: updateError } = await supabase
    .from('missions')
    .update({ published_data: data.draft_data, published_version: version, status: 'published', published_at: new Date().toISOString() })
    .eq('id', id)
  if (updateError) throw updateError
  return version
}

export async function setMissionOpen(id, open) {
  const { error } = await supabase.from('missions').update({ is_open: open }).eq('id', id)
  if (error) throw error
}

// Student side: only published AND open missions are visible, through the published_missions view.
export async function fetchPublishedMissions() {
  const { data, error } = await supabase
    .from('published_missions')
    .select('id, title, category_id, cover_url, published_at')
    .order('published_at', { ascending: false })
  if (error) throw error
  return data ?? []
}
