# 開發進度（PROGRESS）

> 最新的放最上面。每個階段結束必須更新：完成內容、資料表變更、已知問題、下一步。
> 規格書：`docs/spec-v5.md`。禁止寫入密碼、API 金鑰、token。

## 2026-10-01 交接準備（科學任務偵探所 v5）

### 完成內容
- 只做交接準備，未寫任何功能程式。
- 建立 repo 根目錄 `CLAUDE.md`（新對話入口）與本檔；`docs/spec-v5.md` 納入版控。

### 資料表變更
- 無。

### 已知問題／待處理
- Vercel 上已無用的環境變數 `VITE_ADMIN_EMAIL`、`VITE_ADMIN_PASSWORD` 可由老師自行刪除（程式已不讀取）。
- 尚無自動化測試，目前靠本機預覽＋`npm run build`。
- `xlsx` 套件有已知安全通告（只影響「解析不可信檔案」，本系統只做匯出）。
- 舊紀錄 `docs/進度紀錄.md`、`docs/決策紀錄.md` 目前不在版控內，之後由老師決定保留或併入本檔。

### 下一步
- **規格書第十八節 第 1 階段「系統更名與地基」**：
  - 首頁與標題改為「科學任務偵探所」
  - 後台側邊欄依規格書第三節重整（既有頁面搬移，功能不變）
  - 建立第四節的新資料表（`missions`、`mission_categories`、`mission_assets`、`mission_logs`、`mission_submissions`）、RLS、Storage bucket `mission-assets`、`student_sessions` 新欄位（`mission_id`、`mission_version`，`mode` 新增 `mission`）
  - 任務列表頁（新增、複製、刪除、分類）、草稿／發布狀態欄位
- 開工前依規格書第二節：先讀 `CLAUDE.md`、本檔、`經驗庫.md`，檢查與既有功能的相容性；在獨立分支開發，用 Vercel 預覽測試，完成後停下回報。

---

## 已完成：Phase 1～2.5（2026-09-22 ～ 09-26，依舊紀錄整理）

### Phase 0 基礎建置
- React + Vite + Tailwind + Supabase 專案、資料表與種子資料、GitHub、Vercel 部署（補 SPA rewrite 解決深層網址 404）。

### Phase 1 首頁與 UI、PK 對戰
- 首頁與整體 UI 改版（淺色系、鑑識實驗室風格）；系統名稱「化學偵探學習系統」；學生資訊彈窗（sessionStorage 記憶）。
- 雙人 PK：旋轉分割畫面（<600px 改上下）、獨立 HUD、答案封存後同時揭曉、血量 10 點、題目自動縮字、題目不循環、「再來一局」重讀題庫。

### Phase 1.5 題庫編輯器
- TipTap 工具列、KaTeX、圖片上傳、難度、標籤、篩選與分頁；外觀設定（4 組主題色＋各頁背景圖）；標籤管理。

### Phase 2 學習紀錄
- 學生資訊欄位；`student_sessions`／`task_logs`／`battle_logs`；後台「學習資料」報表（篩選、摘要、展開、Excel 匯出）。

### Phase 2.5 報表與帳號
- 報表補入難度與標籤；後台修改密碼；忘記密碼與重設頁（已實測通過）；紀錄單筆／批次刪除。
- 登入預填信箱寫死在 `src/lib/supabase.js`；建立開發紀錄制度與 `/checkin`、`/wrapup`。

### 現有資料表（不得刪除或改名）
- 題庫相關（見 `supabase/schema.sql`、`editor-upgrade.sql`）、`student_sessions`、`task_logs`、`battle_logs`（見 `supabase/logs.sql`）；Storage 見 `supabase/storage.sql`。
