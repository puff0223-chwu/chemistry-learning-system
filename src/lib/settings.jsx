import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase.js'

export const THEMES = {
  blue: { label: '🔵 深藍冷色', description: '預設', accent: '#00D4FF', warning: '#FFB800' },
  amber: { label: '🟡 琥珀暖色', description: '溫暖', accent: '#FFB800', warning: '#FF5252' },
  green: { label: '🟢 翠綠自然', description: '自然', accent: '#00E676', warning: '#FFB800' },
  purple: { label: '🟣 紫羅蘭神秘', description: '神秘', accent: '#CE93D8', warning: '#FFB800' },
}

export const DEFAULT_BACKGROUNDS = {
  bg_home: '/bg-home.jpg.png',
  bg_task: '/bg-task.jpg.png',
  bg_battle: '/bg-battle.jpg.png',
}

export const DEFAULT_SETTINGS = { theme_preset: 'blue', ...DEFAULT_BACKGROUNDS }

const CACHE_KEY = 'chemistry_settings_cache'

function hexToRgbTriple(hex) {
  const n = parseInt(hex.slice(1), 16)
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`
}

export function applyTheme(preset) {
  const theme = THEMES[preset] ?? THEMES.blue
  const style = document.documentElement.style
  style.setProperty('--accent', theme.accent)
  style.setProperty('--accent-rgb', hexToRgbTriple(theme.accent))
  style.setProperty('--warning', theme.warning)
  style.setProperty('--warning-rgb', hexToRgbTriple(theme.warning))
}

function readCache() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') }
  } catch {
    return DEFAULT_SETTINGS
  }
}

function writeCache(settings) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(settings))
  } catch {
    // storage unavailable — the theme just won't be pre-applied next time
  }
}

const SettingsContext = createContext({ settings: DEFAULT_SETTINGS, setSetting: () => {} })

// Reads the settings table once when the app starts and applies the theme colors to :root.
export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(readCache)

  useEffect(() => {
    applyTheme(settings.theme_preset)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.theme_preset])

  useEffect(() => {
    let active = true
    supabase
      .from('settings')
      .select('key, value')
      .then(({ data, error }) => {
        if (!active || error || !data) return
        const loaded = Object.fromEntries(data.map((row) => [row.key, row.value]))
        setSettings((prev) => {
          const next = { ...prev, ...loaded }
          writeCache(next)
          return next
        })
      })
    return () => {
      active = false
    }
  }, [])

  // Lets the admin 外觀設定 page update what's on screen right after saving.
  const setSetting = useCallback((key, value) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value }
      writeCache(next)
      return next
    })
  }, [])

  const value = useMemo(() => ({ settings, setSetting }), [settings, setSetting])
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings() {
  return useContext(SettingsContext)
}
