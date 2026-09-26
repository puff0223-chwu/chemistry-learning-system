import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('缺少 Supabase 環境變數，請確認 .env 檔案設定 VITE_SUPABASE_URL 與 VITE_SUPABASE_PUBLISHABLE_KEY')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export const DEFAULT_ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL || 'teacher@chemistry-learning-system.local'

export async function adminSignIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })
  if (error) throw error
  return data
}

// Where the link in the password-reset email lands. This exact URL must be listed under
// Supabase → Authentication → URL Configuration → Redirect URLs, or Supabase refuses to redirect there.
export const RESET_PASSWORD_URL = 'https://chemistry-learning-system.vercel.app/admin/reset-password'

export async function adminSignOut() {
  await supabase.auth.signOut()
}

export async function getAdminSession() {
  const { data } = await supabase.auth.getSession()
  return data.session
}
