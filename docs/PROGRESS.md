# 開發進度（PROGRESS）

> 最新的放最上面。每個階段結束必須更新：完成內容、資料表變更、已知問題、下一步。
> 規格書：`docs/spec-v5.md`。禁止寫入密碼、API 金鑰、token。

## 2026-10-01 第 2 階段「素材庫」（老師實測通過，已合併 main）

### 完成內容
- 後台新增 `/admin/assets`「🖼️ 素材庫」（側邊欄：任務工坊 → 素材庫）。
- **上傳**（可一次多個、可拖曳）：
  - 圖片（JPG／PNG／WebP／BMP）在瀏覽器端縮到長邊 ≤1920px 並轉 WebP，品質與尺寸逐步降低直到 ≤300 KB（不會縮到長邊 800px 以下，仍超過會提示）。GIF／SVG 不轉檔，限 1 MB。
  - 影片 MP4／WebM 限 20 MB；音訊 MP3／M4A／AAC／OGG 限 3 MB（瀏覽器無法轉檔，超過或其他格式會請老師先轉好）。
  - 檔名含內容雜湊（`<任務id或shared>/<雜湊>.<副檔名>`），Cache-Control 一年；同一份內容重複上傳只會回報「已經有了」。
  - 上傳時可選「共用素材」或「只給某個任務」。
- **瀏覽**：縮圖卡片、依歸屬／類型篩選，資料庫端分頁（每頁 24 個）。
- **用量**：總用量對 1 GB 的進度條、各任務用量；≥800 MB 顯示黃色提醒與調整建議（刪未用素材 → 長影片改 YouTube → 清舊 logs → 最後才升級）。
- **刪除保護**：任務 JSON（草稿或已發布）或封面引用到的素材標示「使用中」，不能刪除（刪除前會再查一次）。
- **刪除任務時**：詢問是否一併刪除「只屬於此任務」的素材（顯示個數與容量）；仍被其他任務引用的（例如複製出來的任務）自動保留；不勾選則素材變成共用素材。
- `ConfirmDialog` 新增 `children` 屬性（可放勾選框等額外內容）。
- 通過 `npm run lint`（0 error）、`npm run build`；圖片壓縮邏輯在瀏覽器實測（40 MB 雜訊 PNG → 274 KB WebP）。

### 資料表變更（`supabase/phase2-assets.sql`，需老師到 SQL Editor 執行，可重複執行）
- `mission_assets` 新增 `name`（原始檔名，預設空字串）；`storage_path` 加唯一索引。
- 新增函式 `mission_assets_in_use(p_ids uuid[], p_exclude_mission uuid)`：只開放給 authenticated，查出被任務引用的素材 id。
- 沒有刪除或改名任何既有欄位。

### 已知問題／注意
- 「使用中」是用素材 id／路徑在任務 JSON 文字裡比對；編輯器（第 3 階段）必須以素材的 `id`（`mission_assets.id`）當 `assetId` 寫進任務 JSON，這個保護才會生效。
- 刪除保護只在前端與查詢層，沒有資料庫層強制；目前只有老師一人使用，風險低。
- 影片縮圖用 `<video preload="metadata">`，影片多時載入頁面會稍慢（每頁最多 24 個）。
- 用量只計入 `mission_assets` 的 bytes，不含題目圖片與背景圖（它們在別的 bucket）。
- 後台頁面無法自動化登入測試，需老師實測（見下方步驟）。

### 老師測試步驟
1. 到 Supabase SQL Editor 執行 `supabase/phase2-assets.sql`，看到 Success。
2. 本機網址 `http://localhost:5173`（或預覽網址）登入後台 → 任務工坊 → 素材庫。
3. 上傳一張大照片（幾 MB）：應顯示 ✅，卡片上的大小在 300 KB 左右、尺寸不超過 1920。再上傳同一張，應顯示「已經有一樣的素材了」。
4. 上傳一個 MP4（<20 MB）、一個 MP3（<3 MB）；再試超過限制的檔案與 .wav 檔，應看到中文錯誤提示。
5. 試「上傳到」選某個任務，再用歸屬篩選確認；看「各任務用量」展開有數字。
6. 刪除一個素材，確認用量變少。
7. 任務列表刪除一個有素材的任務：對話框應出現「一併刪除…素材」勾選框；分別試勾與不勾，回素材庫確認結果（不勾 → 變共用素材）。

### 下一步
- 已合併 main（SQL 已執行、老師實測通過）。
- 第 3 階段「畫布編輯器核心」。

---

## 2026-10-01 第 1 階段「系統更名與地基」（老師實測通過，已合併 main）

### 完成內容
- 更名「科學任務偵探所」：首頁、網頁標題、後台側邊欄標題、README。首頁兩個入口改為「🗺️ 任務」（→ `/missions`）與「⚔️ 雙人對戰 PK」；右上角「管理登入」。
- 後台側邊欄依規格書第三節重整（網址全部不變）：🧩 任務工坊（任務列表、分類管理）／⚔️ 對戰題庫（主題、題目、標籤）／📊 學習資料（任務關卡資料〔舊版〕、對戰紀錄）／⚙️ 系統設定（主題外觀、帳號設定）。編輯器、素材庫、發布管理、任務紀錄等頁面由後續階段加入。
- 新頁面：`/admin/missions`（任務列表：新增、編輯名稱／分類、複製、刪除、依分類篩選；顯示草稿／已發布／已封存）、`/admin/mission-categories`（新增、改名、排序、刪除）、`/missions`（學生任務列表，分類篩選，只讀得到已發布且開放的任務）。
- 新增 `src/lib/missions.js`（任務 CRUD、空任務 JSON 骨架）。
- 舊版 TaskPlay 保留：`/task` 仍可用，入口移到 `/missions` 頁面底部的小連結（規格書：待新系統上線後由老師決定是否隱藏）。
- 通過 `npm run lint`（0 error）、`npm run build`。

### 資料表變更（`supabase/phase1-missions.sql`，需老師到 SQL Editor 執行，可重複執行）
- 新增：`mission_categories`（預設化學任務／鑑識案件／密室逃脫）、`missions`、`mission_assets`、`mission_logs`（`unique(session_id, seq)`）、`mission_submissions`。
- 新增檢視表 `published_missions`：學生（anon）只能讀到 `status='published' AND is_open=true` 的任務與其 `published_data`；`missions` 表對 anon 完全不授權（看不到草稿）。
- `student_sessions`：新增 `mission_id`、`mission_version`；`mode` 檢查條件放寬為 `task／battle／mission`（既有資料不變）。
- RLS：logs、submissions、sessions 為 anon INSERT only；老師（authenticated）全權限。
- Storage：bucket `mission-assets`（public 讀取，登入老師可上傳／改／刪）。
- 沒有刪除或改名任何既有資料表或欄位。

### 已知問題／注意
- **SQL 執行前，`/missions` 會顯示「載入失敗：找不到 published_missions」**；首頁「任務」入口指向該頁。所以必須先執行 SQL，再合併到 main。
- Phase 1 沒有「發布」功能（發布流程與健檢在第 5 階段），所以學生列表目前一定是空的；卡片尚無點擊動作（播放器在第 4 階段）。
- 任務狀態在 Phase 1 只能顯示，不能切換；`is_open` 的開關在第 12 階段發布管理。
- 刪除任務時尚未處理素材（第 2 階段素材庫處理）。素材紀錄的 `mission_id` 在任務刪除時設為空（變成共用素材）。
- 後台登入後仍導向 `/admin/topics`（沿用舊行為），之後可考慮改成任務列表。
- 登入後的後台頁面本次無法在無登入狀態下自動化測試，需老師實測（見下方步驟）。

### 老師測試步驟
1. 到 Supabase → SQL Editor，貼上 `supabase/phase1-missions.sql` 全部內容並執行；看到 Success 即可。再到 Storage 確認有 `mission-assets` bucket（若沒有，手動建立 public bucket 後重跑 SQL）。
2. 打開 Vercel 預覽網址（推送分支後 Vercel 產生）。首頁應顯示「科學任務偵探所」，點「任務」進入空列表（顯示「目前沒有開放的任務」）。
3. 點右上角「管理登入」登入後台，確認側邊欄分四組；舊功能（主題、題目、標籤、學習資料、外觀、帳號）逐一點開都正常。
4. 任務工坊 → 任務列表 → 新增任務（名稱＋分類）→ 編輯名稱 → 複製（名稱會加「（副本）」）→ 刪除。
5. 任務工坊 → 分類管理：新增、改名、上下移動、刪除分類；回任務列表確認被刪分類的任務變成「未分類」。
6. 試玩一場舊版「任務闖關」與「雙人對戰」，確認可以正常作答、學習資料仍寫入。

### 下一步
- 已合併 main（SQL 已由老師執行並實測通過）。
- 第 2 階段「素材庫」：上傳、瀏覽器端壓縮 WebP、用量統計、刪除保護。

---

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
