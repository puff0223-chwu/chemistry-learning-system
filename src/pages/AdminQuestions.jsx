import { useEffect, useState } from 'react'
import AdminNav from '../components/AdminNav.jsx'
import { supabase } from '../lib/supabase.js'

const EMPTY_FORM = {
  mode: 'both',
  type: 'choice',
  content: '',
  option_a: '',
  option_b: '',
  option_c: '',
  option_d: '',
  answer: '',
  hint_1: '',
  hint_2: '',
  hint_3: '',
  explanation: '',
}

const MODE_LABEL = { task: '任務', pk: 'PK', both: '任務 + PK' }
const TYPE_LABEL = { choice: '單選', fill: '填答' }

export default function AdminQuestions() {
  const [topics, setTopics] = useState([])
  const [topicId, setTopicId] = useState('')
  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [showForm, setShowForm] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)

  useEffect(() => {
    supabase
      .from('topics')
      .select('*')
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (error) return setError(error.message)
        setTopics(data ?? [])
        if (data && data.length > 0) setTopicId(String(data[0].id))
      })
  }, [])

  async function loadQuestions(id) {
    setLoading(true)
    const { data, error } = await supabase
      .from('questions')
      .select('*')
      .eq('topic_id', id)
      .order('created_at', { ascending: true })
    if (error) setError(error.message)
    else setQuestions(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    if (topicId) loadQuestions(topicId)
  }, [topicId])

  function openCreateForm() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  function openEditForm(q) {
    setEditingId(q.id)
    setForm({
      mode: q.mode,
      type: q.type,
      content: q.content ?? '',
      option_a: q.option_a ?? '',
      option_b: q.option_b ?? '',
      option_c: q.option_c ?? '',
      option_d: q.option_d ?? '',
      answer: q.answer ?? '',
      hint_1: q.hint_1 ?? '',
      hint_2: q.hint_2 ?? '',
      hint_3: q.hint_3 ?? '',
      explanation: q.explanation ?? '',
    })
    setShowForm(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    const payload = { ...form, topic_id: topicId }
    if (form.type === 'fill') {
      payload.option_a = null
      payload.option_b = null
      payload.option_c = null
      payload.option_d = null
    }
    if (editingId) {
      const { error } = await supabase.from('questions').update(payload).eq('id', editingId)
      if (error) return setError(error.message)
    } else {
      const { error } = await supabase.from('questions').insert(payload)
      if (error) return setError(error.message)
    }
    setShowForm(false)
    loadQuestions(topicId)
  }

  async function handleDelete(id) {
    setError(null)
    const { error } = await supabase.from('questions').delete().eq('id', id)
    if (error) setError(error.message)
    setDeleteTarget(null)
    loadQuestions(topicId)
  }

  return (
    <div className="min-h-screen bg-paper text-navy md:flex">
      <AdminNav active="questions" />
      <div className="flex-1 min-w-0 max-w-5xl mx-auto w-full px-6 py-8">
        <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
          <h1 className="text-2xl font-bold">題目管理</h1>
          <div className="flex items-center gap-3">
            <select
              value={topicId}
              onChange={(e) => setTopicId(e.target.value)}
              className="bg-white border border-slate-300 rounded-lg px-3 py-2"
            >
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!topicId}
              onClick={openCreateForm}
              className="bg-cyan hover:bg-cyan-dark text-white disabled:opacity-40 rounded-xl px-5 py-2 font-bold"
            >
              + 新增題目
            </button>
          </div>
        </div>

        {error && <p className="text-red-600 mb-4">{error}</p>}
        {topics.length === 0 && !loading && (
          <p className="text-slate-500">請先到「主題管理」新增至少一個主題。</p>
        )}
        {loading && <p className="text-slate-500">載入中...</p>}

        {!loading && topicId && (
          <div className="overflow-x-auto bg-white rounded-2xl border border-slate-200 shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 text-sm">
                  <th className="py-2 pr-4 pl-4">題目內容</th>
                  <th className="py-2 pr-4">類型</th>
                  <th className="py-2 pr-4">模式</th>
                  <th className="py-2 pr-4">操作</th>
                </tr>
              </thead>
              <tbody>
                {questions.map((q) => (
                  <tr key={q.id} className="border-b border-slate-100">
                    <td className="py-3 pr-4 pl-4 max-w-sm truncate">{q.content}</td>
                    <td className="py-3 pr-4">{TYPE_LABEL[q.type]}</td>
                    <td className="py-3 pr-4">{MODE_LABEL[q.mode]}</td>
                    <td className="py-3 pr-4 flex gap-2">
                      <button
                        type="button"
                        onClick={() => openEditForm(q)}
                        className="bg-slate-100 hover:bg-slate-200 rounded-lg px-3 py-1 text-sm"
                      >
                        編輯
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(q)}
                        className="bg-red-100 hover:bg-red-200 text-red-700 rounded-lg px-3 py-1 text-sm"
                      >
                        刪除
                      </button>
                    </td>
                  </tr>
                ))}
                {questions.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-slate-400">
                      這個主題還沒有題目
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-4 z-50 py-8">
          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-2xl p-6 w-full max-w-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto shadow-xl"
          >
            <h2 className="text-xl font-bold">{editingId ? '編輯題目' : '新增題目'}</h2>

            <div className="grid grid-cols-2 gap-4">
              <label className="flex flex-col gap-1 text-sm">
                題型
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-2"
                >
                  <option value="choice">單選</option>
                  <option value="fill">填答</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                適用模式
                <select
                  value={form.mode}
                  onChange={(e) => setForm({ ...form, mode: e.target.value })}
                  className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-2"
                >
                  <option value="task">任務</option>
                  <option value="pk">PK</option>
                  <option value="both">兩者</option>
                </select>
              </label>
            </div>

            <label className="flex flex-col gap-1 text-sm">
              題目內容
              <textarea
                required
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-2"
                rows={2}
              />
            </label>

            {form.type === 'choice' && (
              <div className="grid grid-cols-2 gap-3">
                {['a', 'b', 'c', 'd'].map((letter) => (
                  <label key={letter} className="flex flex-col gap-1 text-sm">
                    選項 {letter.toUpperCase()}
                    <input
                      value={form[`option_${letter}`]}
                      onChange={(e) => setForm({ ...form, [`option_${letter}`]: e.target.value })}
                      className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-2"
                    />
                  </label>
                ))}
              </div>
            )}

            <label className="flex flex-col gap-1 text-sm">
              正確答案{form.type === 'choice' ? '（填 A / B / C / D）' : ''}
              <input
                required
                value={form.answer}
                onChange={(e) => setForm({ ...form, answer: e.target.value })}
                className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-2"
              />
            </label>

            <div className="grid grid-cols-1 gap-3">
              <label className="flex flex-col gap-1 text-sm">
                提示 1（選填）
                <input
                  value={form.hint_1}
                  onChange={(e) => setForm({ ...form, hint_1: e.target.value })}
                  className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-2"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                提示 2（選填）
                <input
                  value={form.hint_2}
                  onChange={(e) => setForm({ ...form, hint_2: e.target.value })}
                  className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-2"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                提示 3（選填）
                <input
                  value={form.hint_3}
                  onChange={(e) => setForm({ ...form, hint_3: e.target.value })}
                  className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-2"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                完整解析（選填）
                <textarea
                  value={form.explanation}
                  onChange={(e) => setForm({ ...form, explanation: e.target.value })}
                  className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-2"
                  rows={2}
                />
              </label>
            </div>

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
            <h2 className="text-lg font-bold">確認刪除這一題？</h2>
            <p className="text-slate-600 text-sm truncate">{deleteTarget.content}</p>
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
                className="bg-red-600 hover:bg-red-500 rounded-xl px-4 py-2 font-bold"
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
