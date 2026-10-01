import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import AdminNav from '../components/AdminNav.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import {
  STATUS_LABELS,
  createMission,
  deleteMission,
  duplicateMission,
  fetchCategories,
  fetchMissions,
  updateMissionInfo,
} from '../lib/missions.js'
import { deleteAssets, fetchAssetsInUse, fetchMissionAssets, formatBytes } from '../lib/assets.js'

const STATUS_STYLES = {
  draft: 'bg-slate-100 text-slate-600',
  published: 'bg-emerald-100 text-emerald-700',
  archived: 'bg-amber-100 text-amber-700',
}

function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Dialog used for both "新增任務" (mission = null) and "編輯名稱與分類".
function MissionFormDialog({ mission, categories, busy, error, onSubmit, onCancel }) {
  const [title, setTitle] = useState(mission?.title ?? '')
  const [categoryId, setCategoryId] = useState(mission?.category_id ?? categories[0]?.id ?? '')

  function handleSubmit(e) {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    onSubmit({ title: trimmed, categoryId: categoryId === '' ? null : Number(categoryId) })
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center px-4 z-50" style={{ backgroundColor: 'rgba(0, 10, 30, 0.6)' }}>
      <form onSubmit={handleSubmit} className="bg-white text-navy rounded-2xl p-6 w-full max-w-md flex flex-col gap-4 shadow-xl">
        <h2 className="text-lg font-bold">{mission ? '編輯任務資訊' : '新增任務'}</h2>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-600">任務名稱</span>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={60}
            placeholder="例如：消失的實驗藥品"
            className="bg-white border border-slate-300 rounded-lg px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-600">分類</span>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="bg-white border border-slate-300 rounded-lg px-3 py-2"
          >
            <option value="">（未分類）</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" disabled={busy} onClick={onCancel} className="bg-slate-100 hover:bg-slate-200 rounded-xl px-4 py-2">
            取消
          </button>
          <button
            type="submit"
            disabled={busy || !title.trim()}
            className="bg-cyan hover:bg-cyan-dark disabled:opacity-50 text-white rounded-xl px-5 py-2 font-bold"
          >
            {busy ? '儲存中...' : mission ? '儲存' : '建立'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default function AdminMissions() {
  const [missions, setMissions] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('all')
  const [form, setForm] = useState(null) // { mission } while the form dialog is open
  const [deleteTarget, setDeleteTarget] = useState(null)
  // Assets that belong only to the mission being deleted: { missionId, removable, kept }
  const [ownedAssets, setOwnedAssets] = useState(null)
  const [alsoDeleteAssets, setAlsoDeleteAssets] = useState(false)
  const [busy, setBusy] = useState(false)
  const [dialogError, setDialogError] = useState(null)

  const load = useCallback(async () => {
    try {
      const [m, c] = await Promise.all([fetchMissions(), fetchCategories()])
      setMissions(m)
      setCategories(c)
      setError(null)
    } catch (err) {
      setError(`載入失敗：${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // `inDialog`: show a failure inside the open dialog instead of on the page.
  async function run(action, { onDone, inDialog = true } = {}) {
    setBusy(true)
    setDialogError(null)
    try {
      await action()
      onDone?.()
      await load()
    } catch (err) {
      if (inDialog) setDialogError(err.message)
      else setError(`操作失敗：${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  function handleSubmitForm(values) {
    const target = form.mission
    run(
      () => (target ? updateMissionInfo(target.id, values) : createMission(values)),
      { onDone: () => setForm(null) },
    )
  }

  // Looks up the assets owned by this mission. Ones still referenced by another mission (for example a
  // duplicate that copied the draft) are kept, so deleting one mission never breaks another.
  async function openDelete(mission) {
    setDialogError(null)
    setAlsoDeleteAssets(false)
    setOwnedAssets(null)
    setDeleteTarget(mission)
    try {
      const owned = await fetchMissionAssets(mission.id)
      const stillUsed = await fetchAssetsInUse(
        owned.map((a) => a.id),
        mission.id,
      )
      setOwnedAssets({
        missionId: mission.id,
        removable: owned.filter((a) => !stillUsed.has(a.id)),
        kept: owned.filter((a) => stillUsed.has(a.id)),
      })
    } catch (err) {
      setDialogError(`查詢素材失敗：${err.message}`)
    }
  }

  async function confirmDelete() {
    const removable = alsoDeleteAssets && ownedAssets?.missionId === deleteTarget.id ? ownedAssets.removable : []
    // Assets first: once the mission is gone their link to it is cleared and they turn into shared assets.
    await run(
      async () => {
        await deleteAssets(removable)
        await deleteMission(deleteTarget.id)
      },
      { onDone: () => setDeleteTarget(null) },
    )
  }

  function handleDuplicate(mission) {
    setError(null)
    run(() => duplicateMission(mission.id), { inDialog: false })
  }

  const categoryName = (id) => categories.find((c) => c.id === id)?.name ?? '未分類'
  const visible = missions.filter((m) => {
    if (filter === 'all') return true
    if (filter === 'none') return m.category_id === null
    return m.category_id === Number(filter)
  })

  return (
    <div className="min-h-screen bg-paper text-navy md:flex">
      <AdminNav active="missions" />
      <div className="flex-1 min-w-0 max-w-5xl w-full mx-auto px-6 py-8 flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">🧩 任務列表</h1>
          <button
            type="button"
            onClick={() => {
              setDialogError(null)
              setForm({ mission: null })
            }}
            className="bg-cyan hover:bg-cyan-dark text-white rounded-xl px-5 py-2 font-bold"
          >
            ＋ 新增任務
          </button>
        </div>
        <p className="text-slate-600 text-sm">
          一個任務就是一個完整的小遊戲。新增後是「草稿」，學生看不到；按「編輯內容」進入場景編輯器，發布功能會在後續階段開放。
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="依分類篩選"
            className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="all">全部分類</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value="none">未分類</option>
          </select>
          <Link to="/admin/mission-categories" className="text-sm text-cyan-dark underline">
            管理分類
          </Link>
        </div>

        {error && <p className="text-red-600">{error}</p>}
        {loading && <p className="text-slate-400">載入中...</p>}
        {!loading && !error && visible.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-500">
            {missions.length === 0 ? '還沒有任何任務，按右上角「新增任務」開始。' : '這個分類下沒有任務。'}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {visible.map((m) => (
            <div key={m.id} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-bold break-words min-w-0">{m.title}</h2>
                <span className={`shrink-0 text-xs font-bold rounded-full px-3 py-1 ${STATUS_STYLES[m.status]}`}>
                  {STATUS_LABELS[m.status]}
                </span>
              </div>
              <p className="text-sm text-slate-500">
                {categoryName(m.category_id)}
                {m.status === 'published' && `・第 ${m.published_version} 版・${m.is_open ? '開放中' : '未開放'}`}
                <br />
                最後修改：{formatTime(m.updated_at)}
              </p>
              <div className="flex flex-wrap gap-2">
                <Link to={`/admin/missions/${m.id}/edit`} className="bg-cyan hover:bg-cyan-dark text-white rounded-lg px-3 py-1.5 text-sm font-bold">
                  ✏️ 編輯內容
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setDialogError(null)
                    setForm({ mission: m })
                  }}
                  className="bg-slate-100 hover:bg-slate-200 rounded-lg px-3 py-1.5 text-sm"
                >
                  名稱／分類
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleDuplicate(m)}
                  className="bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded-lg px-3 py-1.5 text-sm"
                >
                  複製
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDialogError(null)
                    openDelete(m)
                  }}
                  className="bg-red-50 hover:bg-red-100 text-red-700 rounded-lg px-3 py-1.5 text-sm"
                >
                  刪除
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {form && (
        <MissionFormDialog
          mission={form.mission}
          categories={categories}
          busy={busy}
          error={dialogError}
          onSubmit={handleSubmitForm}
          onCancel={() => setForm(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title={`刪除任務「${deleteTarget.title}」？`}
          message="刪除後無法復原，學生的遊玩紀錄會保留但不再連到這個任務。確定要刪除嗎？"
          confirmText="確定刪除"
          busy={busy}
          error={dialogError}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        >
          {ownedAssets?.missionId === deleteTarget.id && ownedAssets.removable.length + ownedAssets.kept.length > 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm flex flex-col gap-2">
              {ownedAssets.removable.length > 0 && (
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={alsoDeleteAssets}
                    onChange={(e) => setAlsoDeleteAssets(e.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    一併刪除只屬於這個任務的 {ownedAssets.removable.length} 個素材（共{' '}
                    {formatBytes(ownedAssets.removable.reduce((sum, a) => sum + a.bytes, 0))}）
                    <br />
                    <span className="text-slate-500">不勾選的話，這些素材會留在素材庫，變成共用素材。</span>
                  </span>
                </label>
              )}
              {ownedAssets.kept.length > 0 && (
                <p className="text-slate-500">另有 {ownedAssets.kept.length} 個素材仍被其他任務使用，會保留。</p>
              )}
            </div>
          )}
        </ConfirmDialog>
      )}
    </div>
  )
}
