import { useRef, useState } from 'react'
import AdminNav from '../components/AdminNav.jsx'
import { supabase } from '../lib/supabase.js'
import { BACKGROUND_BUCKET, removeByUrl, uploadImage } from '../lib/storage.js'
import { DEFAULT_BACKGROUNDS, THEMES, useSettings } from '../lib/settings.jsx'

const BACKGROUNDS = [
  { key: 'bg_home', page: 'home', label: '首頁背景' },
  { key: 'bg_task', page: 'task', label: '任務關卡背景' },
  { key: 'bg_battle', page: 'battle', label: '對戰背景' },
]

async function saveSetting(key, value) {
  const { error } = await supabase.from('settings').upsert({ key, value, updated_at: new Date().toISOString() })
  if (error) throw error
}

function BackgroundCard({ item, url, onChanged }) {
  const fileInput = useRef(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const isDefault = url === DEFAULT_BACKGROUNDS[item.key]

  async function replaceWith(newUrl) {
    const oldUrl = url
    await saveSetting(item.key, newUrl)
    onChanged(item.key, newUrl)
    // The previous custom image is no longer used anywhere, so free its storage.
    if (oldUrl && oldUrl !== newUrl) removeByUrl(BACKGROUND_BUCKET, oldUrl)
  }

  async function handleUpload(file) {
    if (!file) return
    setBusy(true)
    setMessage(null)
    try {
      await replaceWith(await uploadImage(BACKGROUND_BUCKET, file, `${item.page}-`))
      setMessage({ ok: true, text: '已更新背景' })
    } catch (err) {
      console.error('[appearance] 背景上傳失敗：', err)
      setMessage({ ok: false, text: `上傳失敗：${err.message}` })
    } finally {
      setBusy(false)
    }
  }

  async function handleReset() {
    setBusy(true)
    setMessage(null)
    try {
      await replaceWith(DEFAULT_BACKGROUNDS[item.key])
      setMessage({ ok: true, text: '已恢復預設' })
    } catch (err) {
      setMessage({ ok: false, text: `恢復失敗：${err.message}` })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col gap-3">
      <h3 className="font-bold">{item.label}</h3>
      <div
        className="w-full aspect-video rounded-lg bg-cover bg-center border border-slate-200"
        style={{ backgroundImage: `url("${url}")` }}
        role="img"
        aria-label={`${item.label}目前使用中的圖片`}
      />
      <p className="text-xs text-slate-500">{isDefault ? '目前使用：預設背景' : '目前使用：自訂背景'}</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => fileInput.current?.click()}
          className="bg-cyan hover:bg-cyan-dark disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-bold"
        >
          {busy ? '處理中...' : '上傳新背景'}
        </button>
        <button
          type="button"
          disabled={busy || isDefault}
          onClick={handleReset}
          className="bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded-lg px-4 py-2 text-sm"
        >
          恢復預設
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            handleUpload(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </div>
      {message && <p className={`text-sm ${message.ok ? 'text-green-700' : 'text-red-600'}`}>{message.text}</p>}
    </div>
  )
}

export default function AdminAppearance() {
  const { settings, setSetting } = useSettings()
  const [themeError, setThemeError] = useState(null)
  const [savingTheme, setSavingTheme] = useState(false)

  async function chooseTheme(preset) {
    if (preset === settings.theme_preset) return
    setThemeError(null)
    setSavingTheme(true)
    try {
      await saveSetting('theme_preset', preset)
      setSetting('theme_preset', preset)
    } catch (err) {
      setThemeError(`儲存失敗：${err.message}`)
    } finally {
      setSavingTheme(false)
    }
  }

  return (
    <div className="min-h-screen bg-paper text-navy md:flex">
      <AdminNav active="appearance" />
      <div className="flex-1 min-w-0 max-w-5xl w-full mx-auto px-6 py-8 flex flex-col gap-8">
        <h1 className="text-2xl font-bold">🎨 外觀設定</h1>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-bold">預設主題色</h2>
          <p className="text-sm text-slate-600">選擇後立即套用到學生端的按鈕、邊框、進度條與發光效果。</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Object.entries(THEMES).map(([preset, theme]) => {
              const active = settings.theme_preset === preset
              return (
                <button
                  key={preset}
                  type="button"
                  disabled={savingTheme}
                  onClick={() => chooseTheme(preset)}
                  className={`text-left rounded-2xl p-4 border-2 bg-white shadow-sm flex flex-col gap-3 ${
                    active ? 'border-cyan' : 'border-slate-200 hover:border-slate-400'
                  }`}
                >
                  <span className="font-bold">
                    {theme.label}
                    {active && <span className="ml-2 text-xs text-cyan-dark">使用中</span>}
                  </span>
                  <span className="flex gap-2">
                    <span className="w-8 h-8 rounded-full border border-slate-200" style={{ background: theme.accent }} title="強調色" />
                    <span className="w-8 h-8 rounded-full border border-slate-200" style={{ background: theme.warning }} title="警示色" />
                  </span>
                </button>
              )
            })}
          </div>
          {themeError && <p className="text-red-600 text-sm">{themeError}</p>}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-bold">背景圖片</h2>
          <p className="text-sm text-slate-600">建議使用橫式、8 MB 以下的圖片；學生端會在上面疊一層深色遮罩讓文字清楚。</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {BACKGROUNDS.map((item) => (
              <BackgroundCard key={item.key} item={item} url={settings[item.key]} onChanged={setSetting} />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
