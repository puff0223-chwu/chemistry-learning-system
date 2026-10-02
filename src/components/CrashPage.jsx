// Friendly full-page messages for "something broke" situations, so nobody is left looking at a white screen.
// (Plain styles on purpose: these must still work when other parts of the app are the thing that broke.)
const wrap = 'min-h-screen flex items-center justify-center px-6 bg-[#f4f7fb] text-[#1b2b4a]'
const card = 'bg-white rounded-2xl shadow-lg p-8 max-w-lg w-full flex flex-col gap-4'
const primary = 'bg-[#00b4d8] hover:bg-[#0096b4] text-white rounded-xl px-5 py-2 font-bold text-center'

export function CrashPage() {
  return (
    <div className={wrap}>
      <div className={card}>
        <h1 className="text-xl font-bold">😵 這個畫面發生了問題</h1>
        <p className="leading-relaxed">
          很抱歉，網頁剛剛出了狀況。按下面的按鈕重新載入通常就會恢復。
          <br />
          如果你正在編輯任務，內容會自動暫存，重新載入後會問你要不要還原。
        </p>
        <button type="button" onClick={() => window.location.reload()} className={primary}>
          🔄 重新載入
        </button>
        <a href="/" className="text-center text-sm text-slate-500 underline">
          回首頁
        </a>
        <p className="text-xs text-slate-400">如果一直發生，請告訴系統管理者：是在哪個畫面、按了什麼之後發生的。</p>
      </div>
    </div>
  )
}

// Shown when the site was deployed without its database address / public key (e.g. a preview without environment variables).
export function ConfigMissing() {
  return (
    <div className={wrap}>
      <div className={card}>
        <h1 className="text-xl font-bold">⚙️ 這個網站還沒設定好資料庫連線</h1>
        <p className="leading-relaxed">網站少了連到資料庫（Supabase）所需的設定，所以暫時無法使用。這是部署設定的問題，不是你操作錯誤。</p>
        <ol className="list-decimal ml-5 text-sm leading-relaxed">
          <li>到 Vercel →這個專案 → Settings → Environment Variables。</li>
          <li>確認 VITE_SUPABASE_URL 和 VITE_SUPABASE_PUBLISHABLE_KEY 已經填好，而且「Production」和「Preview」都有勾選。</li>
          <li>到 Deployments，對最新的一筆按「Redeploy」。</li>
        </ol>
      </div>
    </div>
  )
}

// A small panel-sized version, for a side panel that failed while the rest of the editor is fine.
export function PanelCrash() {
  return (
    <div className="p-4 text-sm flex flex-col gap-2 bg-amber-50 text-amber-900 rounded-lg m-3">
      <p className="font-bold">⚠️ 這個面板出了問題</p>
      <p>其他部分不受影響。點選別的物件或場景就能繼續；如果還是不行，請存檔後重新整理頁面。</p>
    </div>
  )
}
