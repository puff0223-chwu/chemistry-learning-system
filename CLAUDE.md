# 科學任務偵探所（原化學偵探學習系統，repo：chemistry-learning-system）

> 每次新對話的入口說明。開工前請依下方「必讀文件」順序讀完再動手。

## 專案簡介
- 高中化學老師（後台管理題庫、組裝任務、看學習資料）＋ 國中／高中學生（任務闖關、雙人 PK）。
- 正在把「化學偵探學習系統」升級並更名為「科學任務偵探所」：把《科學鑑識虛擬情境編輯器 v4》整合進同一個系統，成為單一遊戲主機。
- 核心原則：引擎（編輯器＋播放器）寫一次，換一份任務資料就是一個新遊戲。任務資料四層：任務 → 關卡 → 場景 → 積木。
- **這是已上線、正在教學使用的系統**，每一步都必須以「不影響現有功能」為前提。
- 目標費用 $0（全部使用免費方案）。

## 技術棧與服務資訊（不含任何金鑰）
- 現行：React 19 + Vite 8 + Tailwind CSS v4 + react-router-dom 7；TipTap + KaTeX + DOMPurify；xlsx（SheetJS）。
- 規劃新增（規格書第十九節）：Konva.js（react-konva，畫布）、react-flow（關卡地圖）、howler.js（音訊）、IndexedDB（離線佇列，如 idb-keyval）。編輯器相關大型套件只在後台延遲載入，學生端不下載。
- 網址：https://chemistry-learning-system.vercel.app
- GitHub：`puff0223-chwu/chemistry-learning-system`（push 到 `main` 會自動部署到正式網站）
- Supabase 專案：`qpbojgkeatdygjimllzs`（新加坡區）；Vercel 部署，分支會自動產生預覽網址。
- 前端只放 Supabase publishable key（寫在 `.env`／Vercel 環境變數，`.env` 不入版控，範例見 `.env.example`）。secret／service_role key 絕不進程式碼、文件、commit。
- 資料庫變更（DDL）只能在 Supabase SQL Editor 執行：寫成 `supabase/*.sql` 存進 repo，請老師貼上執行，並註明順序。

## 必讀文件清單與路徑
1. `CLAUDE.md`（本檔，repo 根目錄）
2. `docs/PROGRESS.md`：開發進度（已完成、資料表變更、已知問題、下一步）
3. `docs/spec-v5.md`：系統開發規格書 v5（完整需求；第十八節為階段順序）
4. `C:\Users\Chwu\Desktop\系統工具開發\Claude-Code\經驗庫.md`：老師本機的跨專案經驗庫（repo 之外）
5. 舊紀錄（僅供參考，不入版控）：`docs/進度紀錄.md`、`docs/決策紀錄.md`

## 開發守則（摘自規格書第二節）
- **分支開發**：每個階段在獨立分支開發，用 Vercel 預覽網址測試；老師確認後才合併到 main。
- **一次一個階段**：依規格書第十八節順序，每完成一個階段就停下，回報完成內容與測試方式，等老師確認再繼續。
- **開工前先盤點**：每階段開始前，先讀 `CLAUDE.md`、`docs/PROGRESS.md`、`經驗庫.md`，並檢查與既有功能（對戰、題庫編輯器、學習紀錄、登入）的相容性，有衝突先回報。
- **資料安全**：不刪除、不改名既有資料表與欄位；新增欄位一律給預設值；所有資料庫變更寫成 SQL migration 檔存進 repo。
- **金鑰**：Supabase 金鑰只放 Vercel 環境變數，不寫進程式碼。
- **介面語言**：所有介面文字（按鈕、標題、提示、錯誤訊息）使用繁體中文；程式碼、變數、commit 訊息可用英文。
- **保留既有功能**：雙人 PK、對戰題庫、題目編輯器、既有 Supabase 資料、舊版 TaskPlay 都不改動行為。

### 沿用的既有慣例
- 學習紀錄（logs）寫入一律 fire-and-forget，失敗只 `console.error`，不可影響學生操作。
- 學生端顯示 TipTap HTML 一律經 `renderRich`（DOMPurify），不可直接 `dangerouslySetInnerHTML`。
- 需老師在外部後台手動做的事（SQL、Redirect URL、環境變數、Storage policy）要明確列出，完成前不可宣稱已上線可用。
- 檢查指令：`npm run lint`、`npm run build`（無自動化測試，以預覽＋build 通過為準）。Node 需用完整路徑 `C:\Program Files\nodejs\node.exe`（PATH 未刷新時）。
- 任何紀錄檔、文件、commit 訊息不得寫入密碼、API 金鑰、token。

## 每階段結束必做事項
1. 更新 `docs/PROGRESS.md`：完成內容、資料表變更、已知問題、下一步。
2. 把新學到的經驗補進老師本機的 `經驗庫.md`（症狀／情境 → 做法 → 為什麼）。
3. 交付時附上：變更檔案清單、SQL migration、Vercel 預覽網址、「老師該怎麼測試」的步驟清單（第一步、第二步…）。
4. 明確列出需要老師手動完成的外部設定。
5. 回報後停下，等老師確認再合併 main、再進下一階段。

## 目前階段
舊系統 Phase 1～2.5 與規格書第 1 階段「系統更名與地基」已完成並上線（SQL 已執行、老師實測通過）。第 2 階段「素材庫」已完成並上線（SQL 已執行、老師實測通過）。第 3 階段「畫布編輯器核心」已完成並上線（老師實測通過）。**下一步：第 4 階段「播放器核心＋事件系統」**。
**老師指定待辦：圖層群組（規格書 6.3）必須在第 7 階段開工前完成**，每階段開工盤點時請確認此項狀態。詳見 `docs/PROGRESS.md`。



## 新系統重點檔案
- `supabase/phase1-missions.sql`：任務系統資料表、RLS、檢視表 `published_missions`、bucket `mission-assets`。
- `src/lib/missions.js`：任務 CRUD、空任務 JSON 骨架；學生端只能讀 `published_missions` 檢視表，不可直接讀 `missions` 表。
- `src/lib/assets.js`：素材上傳（WebP 壓縮、雜湊檔名）、用量、使用中檢查、刪除。**任務 JSON 引用素材一律用 `mission_assets.id` 當 `assetId`**（刪除保護靠它比對）。`supabase/phase2-assets.sql`：`name` 欄位與 `mission_assets_in_use` 函式。
- 編輯器：`src/pages/AdminMissionEditor.jsx`（讀寫 Supabase）→ `src/editor/MissionEditor.jsx`（全螢幕外殼，不碰 Supabase，由 props 傳入草稿、素材、存檔函式）；狀態／復原／自動存檔在 `useMissionEditor.js`；`SceneView.jsx` 以 DOM 繪製場景（播放器要共用它），`SceneCanvas.jsx` 疊 Konva 透明層做互動；`SceneGraph.jsx` 是 react-flow 場景關聯圖。任務 JSON 的結構與預設值在 `src/lib/missionSchema.js`（物件陣列順序＝圖層順序，最後＝最上層）。
- 網址：學生 `/missions`；後台編輯器 `/admin/missions/:id/edit`；後台素材庫 `/admin/assets`；後台 `/admin/missions`、`/admin/mission-categories`；舊版 `/task`、`/battle` 不變。
