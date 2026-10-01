import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import MissionEditor from '../editor/MissionEditor.jsx'
import { fetchEditorAssets, uploadAsset } from '../lib/assets.js'
import { collectAssetIds, normalizeDraft } from '../lib/missionSchema.js'
import { supabase } from '../lib/supabase.js'

// Loads one mission's draft and its assets, then hands them to the editor. Saving only ever writes
// draft_data, so students playing the published version are never affected.
export default function AdminMissionEditor() {
  const { missionId } = useParams()
  const navigate = useNavigate()
  const [state, setState] = useState({ phase: 'loading' })

  useEffect(() => {
    let active = true
    async function load() {
      const { data, error } = await supabase.from('missions').select('id, title, draft_data').eq('id', missionId).maybeSingle()
      if (error) throw error
      if (!data) return { phase: 'missing' }
      const draft = normalizeDraft(data.draft_data)
      const assets = await fetchEditorAssets(missionId, collectAssetIds(draft))
      return { phase: 'ready', title: data.title, draft, assets }
    }
    load()
      .then((result) => active && setState(result))
      .catch((err) => active && setState({ phase: 'error', message: err.message }))
    return () => {
      active = false
    }
  }, [missionId])

  const save = useCallback(
    async (draft) => {
      const { error } = await supabase.from('missions').update({ draft_data: draft }).eq('id', missionId)
      if (error) throw error
    },
    [missionId],
  )
  const upload = useCallback((file) => uploadAsset(file, missionId), [missionId])

  if (state.phase === 'loading') {
    return <div className="min-h-screen flex items-center justify-center bg-paper text-navy text-xl">載入任務中...</div>
  }
  if (state.phase !== 'ready') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-paper text-navy">
        <p className="text-xl">{state.phase === 'missing' ? '找不到這個任務（可能已被刪除）。' : `載入失敗：${state.message}`}</p>
        <Link to="/admin/missions" className="bg-cyan text-white rounded-xl px-5 py-2 font-bold">
          回任務列表
        </Link>
      </div>
    )
  }

  return (
    <MissionEditor
      missionId={missionId}
      title={state.title}
      initialDraft={state.draft}
      initialAssets={state.assets}
      save={save}
      upload={upload}
      onBack={() => navigate('/admin/missions')}
    />
  )
}
