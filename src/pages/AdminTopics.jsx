import { useEffect, useState } from 'react'
import AdminNav from '../components/AdminNav.jsx'
import { supabase } from '../lib/supabase.js'

const EMPTY_FORM = { name: '', description: '', story_context: '', character_intro: '' }

export default function AdminTopics() {
  const [topics, setTopics] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [showForm, setShowForm] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)

  async function loadTopics() {
    setLoading(true)
    const { data, error } = await supabase.from('topics').select('*').order('created_at', { ascending: true })
    if (error) setError(error.message)
    else setTopics(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadTopics()
  }, [])

  function openCreateForm() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  function openEditForm(topic) {
    setEditingId(topic.id)
    setForm({
      name: topic.name ?? '',
      description: topic.description ?? '',
      story_context: topic.story_context ?? '',
      character_intro: topic.character_intro ?? '',
    })
    setShowForm(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (editingId) {
      const { error } = await supabase.from('topics').update(form).eq('id', editingId)
      if (error) return setError(error.message)
    } else {
      const { error } = await supabase.from('topics').insert(form)
      if (error) return setError(error.message)
    }
    setShowForm(false)
    loadTopics()
  }

  async function handleDelete(id) {
    setError(null)
    const { error } = await supabase.from('topics').delete().eq('id', id)
    if (error) setError(error.message)
    setDeleteTarget(null)
    loadTopics()
  }

  return (
    <div className="min-h-screen bg-paper text-navy">
      <AdminNav active="topics" />
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">主題管理</h1>
          <button
            type="button"
            onClick={openCreateForm}
            className="bg-cyan hover:bg-cyan-dark text-white rounded-xl px-5 py-2 font-bold"
          >
            + 新增主題
          </button>
        </div>

        {error && <p className="text-red-600 mb-4">{error}</p>}
        {loading && <p className="text-slate-500">載入中...</p>}

        {!loading && (
          <div className="overflow-x-auto bg-white rounded-2xl border border-slate-200 shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 text-sm">
                  <th className="py-2 pr-4 pl-4">名稱</th>
                  <th className="py-2 pr-4">描述</th>
                  <th className="py-2 pr-4">操作</th>
                </tr>
              </thead>
              <tbody>
                {topics.map((topic) => (
                  <tr key={topic.id} className="border-b border-slate-100">
                    <td className="py-3 pr-4 pl-4 font-bold">{topic.name}</td>
                    <td className="py-3 pr-4 text-slate-600 max-w-xs truncate">{topic.description}</td>
                    <td className="py-3 pr-4 flex gap-2">
                      <button
                        type="button"
                        onClick={() => openEditForm(topic)}
                        className="bg-slate-100 hover:bg-slate-200 rounded-lg px-3 py-1 text-sm"
                      >
                        編輯
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(topic)}
                        className="bg-red-100 hover:bg-red-200 text-red-700 rounded-lg px-3 py-1 text-sm"
                      >
                        刪除
                      </button>
                    </td>
                  </tr>
                ))}
                {topics.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-slate-400">
                      尚無主題
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-4 z-50">
          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-2xl p-6 w-full max-w-lg flex flex-col gap-4 max-h-[90vh] overflow-y-auto shadow-xl"
          >
            <h2 className="text-xl font-bold">{editingId ? '編輯主題' : '新增主題'}</h2>
            <label className="flex flex-col gap-1 text-sm">
              名稱
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-navy"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              描述
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-navy"
                rows={2}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              故事情境（story_context）
              <textarea
                value={form.story_context}
                onChange={(e) => setForm({ ...form, story_context: e.target.value })}
                className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-navy"
                rows={3}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              角色介紹（character_intro）
              <input
                value={form.character_intro}
                onChange={(e) => setForm({ ...form, character_intro: e.target.value })}
                className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-navy"
              />
            </label>
            <div className="flex justify-end gap-3 mt-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="bg-slate-100 hover:bg-slate-200 rounded-xl px-4 py-2"
              >
                取消
              </button>
              <button type="submit" className="bg-cyan hover:bg-cyan-dark text-white rounded-xl px-4 py-2 font-bold">
                儲存
              </button>
            </div>
          </form>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm flex flex-col gap-4 shadow-xl">
            <h2 className="text-lg font-bold">確認刪除「{deleteTarget.name}」？</h2>
            <p className="text-slate-600 text-sm">此主題下的所有題目也會一起刪除，此操作無法復原。</p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="bg-slate-100 hover:bg-slate-200 rounded-xl px-4 py-2"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => handleDelete(deleteTarget.id)}
                className="bg-red-600 hover:bg-red-500 text-white rounded-xl px-4 py-2 font-bold"
              >
                確定刪除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
