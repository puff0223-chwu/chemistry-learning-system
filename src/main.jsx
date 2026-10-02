import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { ConfigMissing, CrashPage } from './components/CrashPage.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { supabaseConfigured } from './lib/supabase.js'
import { SettingsProvider } from './lib/settings.jsx'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary fallback={<CrashPage />}>
      {supabaseConfigured ? (
        <BrowserRouter>
          <SettingsProvider>
            <App />
          </SettingsProvider>
        </BrowserRouter>
      ) : (
        <ConfigMissing />
      )}
    </ErrorBoundary>
  </StrictMode>,
)
