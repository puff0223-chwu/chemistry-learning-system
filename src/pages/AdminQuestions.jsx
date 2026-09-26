import { useEffect, useState } from 'react'
import AdminNav from '../components/AdminNav.jsx'
import RichTextEditor from '../components/RichTextEditor.jsx'
import { supabase } from '../lib/supabase.js'
import { DIFFICULTIES, DIFFICULTY_LABEL, MODE_LABEL, TYPE_LABEL } from '../lib/questionMeta.js'
import { htmlToText, truncate } from '../lib/richText.js'

const PAGE_SIZE = 30
const NO_DIFFICULTY = '__none'
const EMPTY_FILTERS = { topicId: '', type: '', difficulty: '', tagIds: [], keyword: '' }
const EMPTY_FORM = {
  topicId: '',
  mode: 'both',
  type: 'choice',
  difficulty: '',
  tagIds: [],
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

const CONTROL = 'bg-white border border-slate-300 rounded-lg px-3 py-2 text-navy'
const FIELD = 'flex flex-col gap-1 text-sm text-slate-600'

function TagChips({ tags, selected, onToggle }) {
  if (tags.length === 0) return <p className="text-sm text-slate-400">尚無標籤（可到「標籤管理」新增）</p>
  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => {
        const active = selected.includes(tag.id)
        return (
          <button
            key={tag.id}
            type="button"
            onClick={() => onToggle(tag.id)}
            className={`rounded-full px-3 py-1 text-sm border ${
              active ? 'bg-cyan text-white border-cyan' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
            }`}
          >
            {tag.name}
          </button>
        )
      })}
    </div>
  )
}

function EditorField({ label, children }) {
  return (
    <div className="flex flex-col gap-1 text-sm text-slate-600">
      <span>{label}</span>
      {children}
    </div>
  )
}

export default function AdminQuestions() {
  const [topics, setTopics] = useState([])
  const [tags, setTags] = useState([])
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [applied, setApplied] = useState(EMPTY_FILTERS)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formKey, setFormKey] = useState(0)
  const [formError, setFormError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const topicName = (id) => topics.find((t) => t.id === id)?.name ?? '（已刪除的主題）'
  const tagName = (id) => tags.find((t) => t.id === id)?.name

  async function search(nextFilters, pageNum) {
    setLoading(true)
    setError(null)
    let query = supabase.from('questions').select('*', { count: 'exact' })
    if (nextFilters.topicId) query = query.eq('topic_id', nextFilters.topicId)
    if (nextFilters.type) query = query.eq('type', nextFilters.type)
    if (nextFilters.difficulty === NO_DIFFICULTY) query = query.is('difficulty', null)
    else if (nextFilters.difficulty) query = query.eq('difficulty', nextFilters.difficulty)
    if (nextFilters.tagIds.length) query = query.contains('content_tag_ids', nextFilters.tagIds)
    const keyword = nextFilters.keyword.trim().replace(/[\\%_]/g, (c) => `\\${c}`)
    if (keyword) query = query.ilike('content', `%${keyword}%`)
    const from = pageNum * PAGE_SIZE
    const { data, count, error: err } = await query.order('id', { ascending: false }).range(from, from + PAGE_SIZE - 1)
    if (err) {
      // Asking for a page past the end (e.g. after deleting the last row of it) is reported as an error.
      if (pageNum > 0) return search(nextFilters, pageNum - 1)
      setError(err.message)
      setLoading(false)
      return
    }
    setQuestions(data ?? [])
    setTotal(count ?? 0)
    setApplied(nextFilters)
    setPage(pageNum)
    setLoading(false)
  }

  useEffect(() => {
    Promise.all([
      supabase.from('topics').select('*').order('created_at', { ascending: true }),
      supabase.from('tags').select('*').order('name', { ascending: true }),
    ]).then(([topicRes, tagRes]) => {
      setTopics(topicRes.data ?? [])
      setTags(tagRes.data ?? [])
    })
    search(EMPTY_FILTERS, 0)
  }, [])

  const toggleId = (list, id) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

  function clearFilters() {
    setFilters(EMPTY_FILTERS)
    search(EMPTY_FILTERS, 0)
  }

  function openForm(question) {
    setFormError(null)
    setFormKey((k) => k + 1)
    if (question) {
      setEditingId(question.id)
      setForm({
        topicId: String(question.topic_id ?? ''),
        mode: question.mode,
        type: question.type,
        difficulty: question.difficulty ?? '',
        tagIds: question.content_tag_ids ?? [],
        content: question.content ?? '',
        option_a: question.option_a ?? '',
        option_b: question.option_b ?? '',
        option_c: question.option_c ?? '',
        option_d: question.option_d ?? '',
        answer: question.answer ?? '',
        hint_1: question.hint_1 ?? '',
        hint_2: question.hint_2 ?? '',
        hint_3: question.hint_3 ?? '',
        explanation: question.explanation ?? '',
      })
    } else {
      setEditingId(null)
      setForm({ ...EMPTY_FORM, topicId: filters.topicId || String(topics[0]?.id ?? '') })
    }
    setShowForm(true)
  }

  const setField = (patch) => setForm((prev) => ({ ...prev, ...patch }))

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError(null)
    if (!form.topicId) return setFormError('請選擇主題')
    if (!form.content) return setFormError('請輸入題目內容')
    if (!form.answer.trim()) return setFormError('請填寫正確答案')

    const isChoice = form.type === 'choice'
    const payload = {
      topic_id: Number(form.topicId),
      mode: form.mode,
      type: form.type,
      difficulty: form.difficulty || null,
      content_tag_ids: form.tagIds,
      content: form.content,
      option_a: isChoice ? form.option_a || null : null,
      option_b: isChoice ? form.option_b || null : null,
      option_c: isChoice ? form.option_c || null : null,
      option_d: isChoice ? form.option_d || null : null,
      answer: form.answer.trim(),
      hint_1: form.hint_1 || null,
      hint_2: form.hint_2 || null,
      hint_3: form.hint_3 || null,
      explanation: form.explanation || null,
    }
    setSaving(true)
    const { error: err } = editingId
      ? await supabase.from('questions').update(payload).eq('id', editingId)
      : await supabase.from('questions').insert(payload)
    setSaving(false)
    if (err) return setFormError(err.message)
    setShowForm(false)
    search(applied, editingId ? page : 0)
  }

  async function handleDelete(id) {
    setError(null)
    const { error: err } = await supabase.from('questions').delete().eq('id', id)
    if (err) setError(err.message)
    setDeleteTarget(null)
    search(applied, page)
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="min-h-screen bg-paper text-navy md:flex">
      <AdminNav active="questions" />
      <div className="flex-1 min-w-0 w-full px-6 py-8 flex flex-col gap-5">
        <div className="flex flex-wrap justify-between items-center gap-3">
          <h1 className="text-2xl font-bold">題目管理</h1>
          <button
            type="button"
            disabled={topics.length === 0}
            onClick={() => openForm(null)}
            className="bg-cyan hover:bg-cyan-dark text-white disabled:opacity-40 rounded-xl px-5 py-2 font-bold"
          >
            + 新增題目
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            search(filters, 0)
          }}
          className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col gap-3"
        >
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 items-end">
            <label className={FIELD}>
              主題
              <select value={filters.topicId} onChange={(e) => setFilters({ ...filters, topicId: e.target.value })} className={CONTROL}>
                <option value="">全部</option>
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={FIELD}>
              題型
              <select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })} className={CONTROL}>
                <option value="">全部</option>
                <option value="choice">{TYPE_LABEL.choice}</option>
                <option value="fill">{TYPE_LABEL.fill}</option>
              </select>
            </label>
            <label className={FIELD}>
              難度
              <select
                value={filters.difficulty}
                onChange={(e) => setFilters({ ...filters, difficulty: e.target.value })}
                className={CONTROL}
              >
                <option value="">全部</option>
                {DIFFICULTIES.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
                <option value={NO_DIFFICULTY}>未設定</option>
              </select>
            </label>
            <label className={FIELD}>
              關鍵字（題目內容）
              <input value={filters.keyword} onChange={(e) => setFilters({ ...filters, keyword: e.target.value })} className={CONTROL} />
            </label>
          </div>
          <div className={FIELD}>
            內容標籤（選多個時，題目需同時具備）
            <TagChips
              tags={tags}
              selected={filters.tagIds}
              onToggle={(id) => setFilters({ ...filters, tagIds: toggleId(filters.tagIds, id) })}
            />
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={loading} className="bg-cyan hover:bg-cyan-dark disabled:opacity-50 text-white rounded-xl px-5 py-2 font-bold">
              搜尋
            </button>
            <button type="button" onClick={clearFilters} className="bg-slate-100 hover:bg-slate-200 rounded-xl px-5 py-2">
              清除篩選
            </button>
          </div>
        </form>

        {error && <p className="text-red-600">{error}</p>}

        <div className="overflow-x-auto bg-white rounded-2xl border border-slate-200 shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 text-sm">
                {['題目內容', '主題', '題型', '難度', '內容標籤', '操作'].map((h) => (
                  <th key={h} className="py-2 px-3 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-400">
                    載入中...
                  </td>
                </tr>
              )}
              {!loading && questions.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-400">
                    沒有符合條件的題目
                  </td>
                </tr>
              )}
              {!loading &&
                questions.map((q) => (
                  <tr key={q.id} className="border-b border-slate-100 align-top">
                    <td className="py-3 px-3 min-w-[16rem]">{truncate(htmlToText(q.content), 60)}</td>
                    <td className="py-3 px-3 whitespace-nowrap">{topicName(q.topic_id)}</td>
                    <td className="py-3 px-3 whitespace-nowrap">{TYPE_LABEL[q.type]}</td>
                    <td className="py-3 px-3 whitespace-nowrap">{q.difficulty ? DIFFICULTY_LABEL[q.difficulty] : '—'}</td>
                    <td className="py-3 px-3">
                      <div className="flex flex-wrap gap-1">
                        {(q.content_tag_ids ?? []).map((id) => (
                          <span key={id} className="bg-slate-100 text-slate-600 rounded-full px-2 py-0.5 text-xs whitespace-nowrap">
                            {tagName(id) ?? `#${id}`}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <div className="flex gap-2">
                        <button type="button" onClick={() => openForm(q)} className="bg-slate-100 hover:bg-slate-200 rounded-lg px-3 py-1 text-sm">
                          編輯
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(q)}
                          className="bg-red-100 hover:bg-red-200 text-red-700 rounded-lg px-3 py-1 text-sm"
                        >
                          刪除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-3 text-sm text-slate-600">
          <span>
            共 {total} 題　第 {page + 1} / {pageCount} 頁
          </span>
          <button
            type="button"
            disabled={page === 0 || loading}
            onClick={() => search(applied, page - 1)}
            className="bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-40 rounded-lg px-3 py-1"
          >
            上一頁
          </button>
          <button
            type="button"
            disabled={page + 1 >= pageCount || loading}
            onClick={() => search(applied, page + 1)}
            className="bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-40 rounded-lg px-3 py-1"
          >
            下一頁
          </button>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/60 z-50 overflow-y-auto px-4 py-8" style={{ backgroundColor: 'rgba(0, 10, 30, 0.6)' }}>
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-6 w-full max-w-3xl mx-auto flex flex-col gap-4 shadow-xl">
            <h2 className="text-xl font-bold">{editingId ? '編輯題目' : '新增題目'}</h2>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <label className={FIELD}>
                主題
                <select value={form.topicId} onChange={(e) => setField({ topicId: e.target.value })} className={CONTROL}>
                  {topics.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={FIELD}>
                題型
                <select
                  value={form.type}
                  onChange={(e) => setField({ type: e.target.value, answer: '' })}
                  className={CONTROL}
                >
                  <option value="choice">{TYPE_LABEL.choice}</option>
                  <option value="fill">{TYPE_LABEL.fill}</option>
                </select>
              </label>
              <label className={FIELD}>
                適用模式
                <select value={form.mode} onChange={(e) => setField({ mode: e.target.value })} className={CONTROL}>
                  <option value="task">{MODE_LABEL.task}</option>
                  <option value="pk">{MODE_LABEL.pk}</option>
                  <option value="both">兩者</option>
                </select>
              </label>
              <label className={FIELD}>
                難度（選填）
                <select value={form.difficulty} onChange={(e) => setField({ difficulty: e.target.value })} className={CONTROL}>
                  <option value="">未設定</option>
                  {DIFFICULTIES.map((d) => (
                    <option key={d} value={d}>
                      {DIFFICULTY_LABEL[d]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <EditorField label="內容標籤（選填，可複選）">
              <TagChips tags={tags} selected={form.tagIds} onToggle={(id) => setField({ tagIds: toggleId(form.tagIds, id) })} />
            </EditorField>

            <EditorField label="題目內容">
              <RichTextEditor key={`content-${formKey}`} value={form.content} onChange={(v) => setField({ content: v })} minHeight={110} />
            </EditorField>

            {form.type === 'choice' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {['a', 'b', 'c', 'd'].map((letter) => (
                  <EditorField key={letter} label={`選項 ${letter.toUpperCase()}`}>
                    <RichTextEditor
                      key={`opt-${letter}-${formKey}`}
                      value={form[`option_${letter}`]}
                      onChange={(v) => setField({ [`option_${letter}`]: v })}
                      minHeight={56}
                    />
                  </EditorField>
                ))}
              </div>
            )}

            <label className={FIELD}>
              正確答案{form.type === 'fill' ? '（學生輸入需與此完全相同，不分大小寫）' : ''}
              {form.type === 'choice' ? (
                <select value={form.answer} onChange={(e) => setField({ answer: e.target.value })} className={CONTROL}>
                  <option value="">請選擇</option>
                  {['A', 'B', 'C', 'D'].map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              ) : (
                <input value={form.answer} onChange={(e) => setField({ answer: e.target.value })} className={CONTROL} />
              )}
            </label>

            {[1, 2, 3].map((n) => (
              <EditorField key={n} label={`提示 ${n}（選填）`}>
                <RichTextEditor
                  key={`hint-${n}-${formKey}`}
                  value={form[`hint_${n}`]}
                  onChange={(v) => setField({ [`hint_${n}`]: v })}
                  minHeight={56}
                />
              </EditorField>
            ))}

            <EditorField label="完整解析（選填）">
              <RichTextEditor key={`exp-${formKey}`} value={form.explanation} onChange={(v) => setField({ explanation: v })} minHeight={80} />
            </EditorField>

            {formError && <p className="text-red-600 text-sm">{formError}</p>}
            <div className="flex justify-end gap-3 mt-2">
              <button type="button" onClick={() => setShowForm(false)} className="bg-slate-100 hover:bg-slate-200 rounded-xl px-4 py-2">
                取消
              </button>
              <button type="submit" disabled={saving} className="bg-cyan hover:bg-cyan-dark disabled:opacity-50 text-white rounded-xl px-5 py-2 font-bold">
                {saving ? '儲存中...' : '儲存'}
              </button>
            </div>
          </form>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 flex items-center justify-center px-4 z-50" style={{ backgroundColor: 'rgba(0, 10, 30, 0.6)' }}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm flex flex-col gap-4 shadow-xl">
            <h2 className="text-lg font-bold">確認刪除這一題？</h2>
            <p className="text-slate-600 text-sm">{truncate(htmlToText(deleteTarget.content), 60)}</p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setDeleteTarget(null)} className="bg-slate-100 hover:bg-slate-200 rounded-xl px-4 py-2">
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
