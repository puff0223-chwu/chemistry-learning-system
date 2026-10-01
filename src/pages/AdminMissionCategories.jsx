import { useCallback, useEffect, useState } from 'react'
import AdminNav from '../components/AdminNav.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import { supabase } from '../lib/supabase.js'
import { fetchCategories } from '../lib/missions.js'

export default function AdminMissionCategories() {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [name, setName] = useState('')
  const [editing, setEditing] = useState(null) // { id, name }
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setCategories(await fetchCategories())
    } catch (err) {
      setError(`載入失敗：${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function duplicateMessage(err, n) {
    return err.code === '23505' ? `已經有「${n}」這個分類了` : err.message
  }

  async function handleAdd(e) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    setError(null)
    setBusy(true)
    const nextOrder = categories.reduce((max, c) => Math.max(max, c.sort_order), 0) + 1
    const { error: err } = await supabase.from('mission_categories').insert({ name: trimmed, sort_order: nextOrder })
    setBusy(false)
    if (err) {
      setError(duplicateMessage(err, trimmed))
      return
    }
    setName('')
    load()
  }

  async function handleRename() {
    const trimmed = editing.name.trim()
    if (!trimmed) return
    setError(null)
    setBusy(true)
    const { error: err } = await supabase.from('mission_categories').update({ name: trimmed }).eq('id', editing.id)
    setBusy(false)
    if (err) {
      setError(duplicateMessage(err, trimmed))
      return
    }
    setEditing(null)
    load()
  }

  // Swaps sort_order with the neighbour so the order shown to students and in filters follows this list.
  async function handleMove(index, delta) {
    const a = categories[index]
    const b = categories[index + delta]
    if (!a || !b) return
    setError(null)
    setBusy(true)
    // Re-number the whole list 1..n so equal sort_order values can never make a swap a no-op.
    const reordered = [...categories]
    reordered[index] = b
    reordered[index + delta] = a
    const results = await Promise.all(
      reordered.map((c, i) => supabase.from('mission_categories').update({ sort_order: i + 1 }).eq('id', c.id)),
    )
    setBusy(false)
    const failed = results.find((r) => r.error)
    if (failed) setError(`排序失敗：${failed.error.message}`)
    load()
  }

  async function handleDelete() {
    setError(null)
    setBusy(true)
    const { error: err } = await supabase.from('mission_categories').delete().eq('id', deleteTarget.id)
    setBusy(false)
    setDeleteTarget(null)
    if (err) setError(`刪除失敗：${err.message}`)
    load()
  }

  return (
    <div className="min-h-screen bg-paper text-navy md:flex">
      <AdminNav active="mission-categories" />
      <div className="flex-1 min-w-0 max-w-3xl w-full mx-auto px-6 py-8 flex flex-col gap-5">
        <h1 className="text-2xl font-bold">🗂️ 任務分類管理</h1>
        <p className="text-slate-600 text-sm">
          分類用來區分任務類型（預設有「化學任務、鑑識案件、密室逃脫」），學生任務列表可依分類篩選。刪除分類不會刪除任務，該分類的任務會變成「未分類」。
        </p>

        <form onSubmit={handleAdd} className="flex gap-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="輸入新分類名稱"
            maxLength={20}
            className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-2"
          />
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="bg-cyan hover:bg-cyan-dark disabled:opacity-50 text-white rounded-xl px-5 py-2 font-bold"
          >
            新增
          </button>
        </form>

        {error && <p className="text-red-600">{error}</p>}

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm divide-y divide-slate-100">
          {loading && <p className="p-4 text-slate-400">載入中...</p>}
          {!loading && categories.length === 0 && <p className="p-4 text-slate-400">還沒有任何分類</p>}
          {categories.map((c, i) => (
            <div key={c.id} className="flex items-center gap-2 px-4 py-3">
              {editing?.id === c.id ? (
                <>
                  <input
                    autoFocus
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    maxLength={20}
                    className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-1.5"
                  />
                  <button
                    type="button"
                    disabled={busy || !editing.name.trim()}
                    onClick={handleRename}
                    className="bg-cyan hover:bg-cyan-dark disabled:opacity-50 text-white rounded-lg px-3 py-1.5 text-sm font-bold"
                  >
                    儲存
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(null)}
                    className="bg-slate-100 hover:bg-slate-200 rounded-lg px-3 py-1.5 text-sm"
                  >
                    取消
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 min-w-0 break-words font-bold">{c.name}</span>
                  <button
                    type="button"
                    aria-label={`${c.name} 往上移`}
                    disabled={busy || i === 0}
                    onClick={() => handleMove(i, -1)}
                    className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`${c.name} 往下移`}
                    disabled={busy || i === categories.length - 1}
                    onClick={() => handleMove(i, 1)}
                    className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing({ id: c.id, name: c.name })}
                    className="bg-slate-100 hover:bg-slate-200 rounded-lg px-3 py-1.5 text-sm"
                  >
                    改名
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(c)}
                    className="bg-red-50 hover:bg-red-100 text-red-700 rounded-lg px-3 py-1.5 text-sm"
                  >
                    刪除
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title={`刪除分類「${deleteTarget.name}」？`}
          message="這個分類下的任務不會被刪除，會變成「未分類」。確定嗎？"
          confirmText="確定刪除"
          busy={busy}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  )
}
