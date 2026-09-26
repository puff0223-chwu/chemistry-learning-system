import { useEffect, useState } from 'react'
import AdminNav from '../components/AdminNav.jsx'
import { supabase } from '../lib/supabase.js'

export default function AdminTags() {
  const [tags, setTags] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [name, setName] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [busy, setBusy] = useState(false)

  async function loadTags() {
    const { data, error: err } = await supabase.from('tags').select('*').order('name', { ascending: true })
    if (err) setError(err.message)
    else setTags(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadTags()
  }, [])

  async function handleAdd(e) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    setError(null)
    setBusy(true)
    const { error: err } = await supabase.from('tags').insert({ name: trimmed })
    setBusy(false)
    if (err) {
      setError(err.code === '23505' ? `已經有「${trimmed}」這個標籤了` : err.message)
      return
    }
    setName('')
    loadTags()
  }

  // Removes the tag id from every question that carries it, then deletes the tag itself.
  async function handleDelete(tag) {
    setError(null)
    setBusy(true)
    try {
      const { data: affected, error: findErr } = await supabase
        .from('questions')
        .select('id, content_tag_ids')
        .contains('content_tag_ids', [tag.id])
      if (findErr) throw findErr
      for (const q of affected ?? []) {
        const { error: updateErr } = await supabase
          .from('questions')
          .update({ content_tag_ids: q.content_tag_ids.filter((id) => id !== tag.id) })
          .eq('id', q.id)
        if (updateErr) throw updateErr
      }
      const { error: deleteErr } = await supabase.from('tags').delete().eq('id', tag.id)
      if (deleteErr) throw deleteErr
    } catch (err) {
      setError(`刪除失敗：${err.message}`)
    } finally {
      setBusy(false)
      setDeleteTarget(null)
      loadTags()
    }
  }

  return (
    <div className="min-h-screen bg-paper text-navy md:flex">
      <AdminNav active="tags" />
      <div className="flex-1 min-w-0 max-w-3xl w-full mx-auto px-6 py-8 flex flex-col gap-5">
        <h1 className="text-2xl font-bold">🏷️ 標籤管理</h1>
        <p className="text-slate-600 text-sm">標籤用來替題目分類（例如「酸鹼」「有機化學」）。標籤不能改名，要改請刪除後重新建立。</p>

        <form onSubmit={handleAdd} className="flex gap-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="輸入新標籤名稱"
            maxLength={30}
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

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          {loading && <p className="text-slate-400">載入中...</p>}
          {!loading && tags.length === 0 && <p className="text-slate-400">還沒有任何標籤</p>}
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span key={tag.id} className="inline-flex items-center gap-2 bg-slate-100 rounded-full pl-4 pr-2 py-1">
                {tag.name}
                <button
                  type="button"
                  aria-label={`刪除標籤 ${tag.name}`}
                  onClick={() => setDeleteTarget(tag)}
                  className="w-6 h-6 rounded-full text-slate-500 hover:bg-red-100 hover:text-red-700"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        </div>
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 flex items-center justify-center px-4 z-50" style={{ backgroundColor: 'rgba(0, 10, 30, 0.6)' }}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm flex flex-col gap-4 shadow-xl">
            <h2 className="text-lg font-bold">刪除標籤「{deleteTarget.name}」？</h2>
            <p className="text-slate-600 text-sm">刪除後會從所有題目移除，確定嗎？</p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => setDeleteTarget(null)}
                className="bg-slate-100 hover:bg-slate-200 rounded-xl px-4 py-2"
              >
                取消
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => handleDelete(deleteTarget)}
                className="bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-xl px-4 py-2 font-bold"
              >
                {busy ? '刪除中...' : '確定刪除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
