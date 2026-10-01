import { useCallback, useEffect, useRef, useState } from 'react'
import AdminNav from '../components/AdminNav.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import { fetchMissions } from '../lib/missions.js'
import {
  STORAGE_LIMIT_BYTES,
  STORAGE_WARN_BYTES,
  TYPE_LABELS,
  assetUrl,
  deleteAssets,
  fetchAssetsInUse,
  fetchAssetsPage,
  fetchUsage,
  formatBytes,
  uploadAsset,
} from '../lib/assets.js'

const PAGE_SIZE = 24

function AssetThumb({ asset }) {
  const url = assetUrl(asset.storage_path)
  if (asset.type === 'image') return <img src={url} alt={asset.name} loading="lazy" className="w-full h-full object-contain" />
  if (asset.type === 'video') return <video src={url} preload="metadata" muted className="w-full h-full object-contain" />
  return <span className="text-5xl">🎵</span>
}

export default function AdminAssets() {
  const [missions, setMissions] = useState([])
  const [usage, setUsage] = useState(null)
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [inUse, setInUse] = useState(new Set())
  const [page, setPage] = useState(0)
  const [missionFilter, setMissionFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [uploadTarget, setUploadTarget] = useState('shared')
  const [uploads, setUploads] = useState([]) // { id, name, state: 'working'|'done'|'error', message }
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const fileInput = useRef(null)

  const loadUsage = useCallback(async () => {
    try {
      setUsage(await fetchUsage())
    } catch (err) {
      setError(`載入用量失敗：${err.message}`)
    }
  }, [])

  const loadPage = useCallback(async () => {
    try {
      const result = await fetchAssetsPage({ page, pageSize: PAGE_SIZE, missionFilter, type: typeFilter })
      setRows(result.rows)
      setTotal(result.total)
      setInUse(await fetchAssetsInUse(result.rows.map((r) => r.id)))
      setError(null)
    } catch (err) {
      setError(`載入素材失敗：${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [page, missionFilter, typeFilter])

  useEffect(() => {
    fetchMissions()
      .then(setMissions)
      .catch((err) => setError(`載入任務失敗：${err.message}`))
    loadUsage()
  }, [loadUsage])

  useEffect(() => {
    loadPage()
  }, [loadPage])

  const missionTitle = (id) => (id === null ? '共用素材' : (missions.find((m) => m.id === id)?.title ?? '（已刪除的任務）'))

  async function handleFiles(fileList) {
    const files = Array.from(fileList)
    if (files.length === 0 || uploading) return
    setUploading(true)
    const missionId = uploadTarget === 'shared' ? null : uploadTarget
    const items = files.map((f, i) => ({ id: `${Date.now()}-${i}`, name: f.name, state: 'working', message: '處理中…' }))
    setUploads(items)
    for (let i = 0; i < files.length; i++) {
      let patch
      try {
        const { status, note } = await uploadAsset(files[i], missionId)
        patch = { state: 'done', message: status === 'exists' ? '已經有一樣的素材了，沒有重複上傳' : (note ?? '完成') }
      } catch (err) {
        patch = { state: 'error', message: err.message }
      }
      setUploads((prev) => prev.map((u) => (u.id === items[i].id ? { ...u, ...patch } : u)))
    }
    setUploading(false)
    if (fileInput.current) fileInput.current.value = ''
    setPage(0)
    await Promise.all([loadUsage(), loadPage()])
  }

  function askDelete(asset) {
    setDeleteError(null)
    setDeleteTarget(asset)
  }

  async function handleDelete() {
    setDeleteBusy(true)
    setDeleteError(null)
    try {
      // Re-check right before deleting: another tab may have started using it.
      const used = await fetchAssetsInUse([deleteTarget.id])
      if (used.has(deleteTarget.id)) {
        setDeleteError('這個素材正在被任務使用，無法刪除。請先從任務中移除它。')
        return
      }
      await deleteAssets([deleteTarget])
      setDeleteTarget(null)
      await Promise.all([loadUsage(), loadPage()])
    } catch (err) {
      setDeleteError(`刪除失敗：${err.message}`)
    } finally {
      setDeleteBusy(false)
    }
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const percent = usage ? Math.min(100, (usage.total / STORAGE_LIMIT_BYTES) * 100) : 0
  const overWarn = usage && usage.total >= STORAGE_WARN_BYTES
  const usageRows = usage
    ? [...usage.byMission.entries()].sort((a, b) => b[1] - a[1]).map(([id, bytes]) => ({ id, bytes, title: missionTitle(id) }))
    : []

  return (
    <div className="min-h-screen bg-paper text-navy md:flex">
      <AdminNav active="assets" />
      <div className="flex-1 min-w-0 max-w-6xl w-full mx-auto px-6 py-8 flex flex-col gap-5">
        <h1 className="text-2xl font-bold">🖼️ 素材庫</h1>
        <p className="text-slate-600 text-sm">
          存放任務用的圖片、影片與音訊。圖片上傳時會自動縮小並轉成 WebP（長邊最多 1920 像素、目標 300 KB 內）；影片單檔最多 20 MB、音訊最多 3 MB。
        </p>

        {error && <p className="text-red-600">{error}</p>}

        <section className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-bold">儲存空間用量</h2>
            <span className="text-sm text-slate-600">
              {usage ? `${formatBytes(usage.total)} ／ 1 GB（免費額度）・共 ${usage.count} 個素材` : '計算中…'}
            </span>
          </div>
          <div className="h-3 rounded-full bg-slate-100 overflow-hidden" role="progressbar" aria-valuenow={Math.round(percent)} aria-valuemin={0} aria-valuemax={100}>
            <div className={`h-full ${overWarn ? 'bg-amber-500' : 'bg-cyan'}`} style={{ width: `${percent}%` }} />
          </div>
          {overWarn && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-900">
              <p className="font-bold mb-1">⚠️ 用量已超過 800 MB，接近免費額度（1 GB）上限。建議依序處理：</p>
              <ol className="list-decimal ml-5">
                <li>刪除沒在使用的素材</li>
                <li>長影片改用 YouTube 不公開連結</li>
                <li>匯出並清理舊學期的學習紀錄</li>
                <li>最後才考慮升級 Supabase Pro（每月 25 美元）</li>
              </ol>
              <p className="mt-1">系統不會自動升級或產生任何費用。</p>
            </div>
          )}
          {usageRows.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-cyan-dark">各任務用量</summary>
              <ul className="mt-2 divide-y divide-slate-100">
                {usageRows.map((r) => (
                  <li key={r.id ?? 'shared'} className="flex justify-between gap-3 py-1.5">
                    <span className="min-w-0 break-words">{r.title}</span>
                    <span className="shrink-0 text-slate-600">{formatBytes(r.bytes)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>

        <section
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            handleFiles(e.dataTransfer.files)
          }}
          className={`bg-white border-2 border-dashed rounded-2xl p-4 shadow-sm flex flex-col gap-3 ${dragOver ? 'border-cyan bg-cyan/5' : 'border-slate-300'}`}
        >
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <span className="text-slate-600">上傳到</span>
              <select
                value={uploadTarget}
                onChange={(e) => setUploadTarget(e.target.value)}
                disabled={uploading}
                className="bg-white border border-slate-300 rounded-lg px-3 py-2"
              >
                <option value="shared">共用素材（所有任務都能用）</option>
                {missions.map((m) => (
                  <option key={m.id} value={m.id}>
                    只給「{m.title}」
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInput.current?.click()}
              className="bg-cyan hover:bg-cyan-dark disabled:opacity-50 text-white rounded-xl px-5 py-2 font-bold"
            >
              {uploading ? '上傳中…' : '選擇檔案上傳'}
            </button>
            <span className="text-sm text-slate-500">也可以把檔案直接拖到這個框裡（可一次多個）</span>
          </div>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept="image/*,video/mp4,video/webm,audio/mpeg,audio/mp4,audio/aac,audio/ogg,.m4a,.mp3,.aac"
            onChange={(e) => handleFiles(e.target.files)}
            className="hidden"
          />
          {uploads.length > 0 && (
            <ul className="text-sm flex flex-col gap-1">
              {uploads.map((u) => (
                <li key={u.id} className="flex gap-2">
                  <span>{u.state === 'working' ? '⏳' : u.state === 'done' ? '✅' : '❌'}</span>
                  <span className="min-w-0 break-words">
                    <b>{u.name}</b>：<span className={u.state === 'error' ? 'text-red-600' : 'text-slate-600'}>{u.message}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={missionFilter}
            onChange={(e) => {
              setMissionFilter(e.target.value)
              setPage(0)
            }}
            aria-label="依歸屬篩選"
            className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="all">全部歸屬</option>
            <option value="shared">共用素材</option>
            {missions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </select>
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value)
              setPage(0)
            }}
            aria-label="依類型篩選"
            className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="all">全部類型</option>
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <span className="text-sm text-slate-500">共 {total} 個</span>
        </div>

        {loading && <p className="text-slate-400">載入中...</p>}
        {!loading && !error && rows.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-500">
            {total === 0 && missionFilter === 'all' && typeFilter === 'all' ? '素材庫還是空的，上傳第一個素材吧。' : '沒有符合條件的素材。'}
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {rows.map((a) => {
            const used = inUse.has(a.id)
            return (
              <div key={a.id} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
                <div className="aspect-video bg-slate-100 flex items-center justify-center overflow-hidden">
                  <AssetThumb asset={a} />
                </div>
                <div className="p-3 flex flex-col gap-1 flex-1">
                  <p className="font-bold text-sm break-all line-clamp-2" title={a.name}>
                    {a.name || a.storage_path}
                  </p>
                  <p className="text-xs text-slate-500">
                    {TYPE_LABELS[a.type] ?? a.type}・{formatBytes(a.bytes)}
                    {a.width && a.height ? `・${a.width}×${a.height}` : ''}
                  </p>
                  <p className="text-xs text-slate-500 break-words">{missionTitle(a.mission_id)}</p>
                  <div className="mt-auto pt-2 flex items-center justify-between gap-2">
                    {used ? (
                      <span className="text-xs font-bold rounded-full px-2 py-0.5 bg-emerald-100 text-emerald-700">使用中</span>
                    ) : (
                      <span className="text-xs text-slate-400">未使用</span>
                    )}
                    <button
                      type="button"
                      disabled={used}
                      title={used ? '使用中的素材不能刪除' : undefined}
                      onClick={() => askDelete(a)}
                      className="bg-red-50 hover:bg-red-100 disabled:opacity-40 disabled:hover:bg-red-50 text-red-700 rounded-lg px-3 py-1 text-sm"
                    >
                      刪除
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {pageCount > 1 && (
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
              className="bg-white border border-slate-300 disabled:opacity-40 rounded-lg px-4 py-1.5 text-sm"
            >
              上一頁
            </button>
            <span className="text-sm text-slate-600">
              第 {page + 1} ／ {pageCount} 頁
            </span>
            <button
              type="button"
              disabled={page >= pageCount - 1}
              onClick={() => setPage(page + 1)}
              className="bg-white border border-slate-300 disabled:opacity-40 rounded-lg px-4 py-1.5 text-sm"
            >
              下一頁
            </button>
          </div>
        )}
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title="刪除這個素材？"
          message={`「${deleteTarget.name || deleteTarget.storage_path}」（${formatBytes(deleteTarget.bytes)}）會從素材庫永久刪除，無法復原。`}
          confirmText="確定刪除"
          busy={deleteBusy}
          error={deleteError}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  )
}
