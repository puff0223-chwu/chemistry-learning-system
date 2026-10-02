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
5. 舊紀錄（Phase 1～2.5 時代的進度與決策，僅供參考；已納入版控，內容不含任何金鑰）：`docs/進度紀錄.md`、`docs/決策紀錄.md`

## 設計守則：兩個視角都要有（老師特別強調，非常重要）
做功能時，**「程式能運作」只是一半**。工程師的視角（資料結構、邏輯、穩定）和使用者的視角（老師怎麼想、怎麼操作最順手）**必須同時考慮**：
- 工程師不是美編也不是使用者研究員。寫完介面前，請換成「教學現場的老師、第一次用、沒有工程背景」的角度走一遍：這個詞老師看得懂嗎？下一步要做什麼看得出來嗎？設定完能看到結果嗎？做錯了能立刻發現嗎？
- 資料結構的形狀不等於老師的思考順序；介面要照老師的問題設計，再對應回資料欄位。
- 具體做法見 `../經驗庫.md`「給老師用的編輯介面設計」：用老師的話、能選就不要打字、空白時給範例、必填標紅、設定後看得見結果、低頻設定移出日常畫面。
- 每個階段交付前，請**實際操作一遍編輯介面並截圖檢查**（不能只看程式通過測試），並在「老師測試步驟」中附上「哪些地方想請老師特別看直不直覺」。
- 學生端畫面要能適應不同尺寸的螢幕（超寬、iPad、手機），不可只在一種尺寸下測試。
- **每個畫面都要「用眼睛看」，不能只檢查文字內容**：用極端內容各看一次（選項只有一個字或幾個數字、很長的句子、空白、很多項目、很窄／很寬的螢幕），並實際看截圖。曾經因為只檢查了文字，漏掉「短選項被圓點蓋住」。
- **崩潰測試（老師要求，每個功能交付前都要做）**：程式員測試不能只走「正常流程」，要主動從各種角度想辦法弄壞它，盡量把「要老師實測才會發現」的問題先找出來。至少做到：
  1. **每個分頁、彈出視窗、選單都用「有資料」的狀態點開一次**（空資料不會觸發的錯誤最容易漏，例如場景有出口時才畫出的條件編輯器）。
  2. **極端資料**：空白、超長文字、很多筆（幾十個物件／場景／關卡）、特殊字元（引號、`<`、emoji）、重複的名稱、被刪除後仍被引用的東西（刪掉場景／物件／素材／目標後，別處的引用會怎樣）。
  3. **亂序與反覆操作**：連按兩次、按到一半取消、復原再重做、切換分頁再切回來、重新整理後續玩、中途關掉再開。
  4. **不同身分與環境**：沒登入、換一台電腦、離線、Vercel 預覽版（環境變數不同）、手機／iPad／超寬螢幕。
  5. **舊資料相容**：用舊版存檔、舊版任務 JSON 開新版，必須能打開。
  6. 看瀏覽器 Console 與檢查工具的**警告**（不只錯誤）。
  7. 找得到、能自動化的，就補進 `tests/`（例如亂數產生任務資料，丟進健檢與引擎，要求不當機）。
- 連線／排版類的介面（場景關聯圖等）要符合真實的方向感：上下左右前後各有自己的連接點，來回的線不重疊，並提供自動整理。

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
- 檢查指令：`npm run lint`、`npm run build`、`npm test`（`tests/` 是遊戲引擎、事件條件、答案鎖、群組的邏輯測試，純 node 不需瀏覽器；改這些邏輯前後都要跑，新功能請補測試；畫面部分以預覽實際操作為準）。Node 需用完整路徑 `C:\Program Files\nodejs\node.exe`（PATH 未刷新時）。
- 任何紀錄檔、文件、commit 訊息不得寫入密碼、API 金鑰、token。

## 每階段結束必做事項
1. 更新 `docs/PROGRESS.md`：完成內容、資料表變更、已知問題、下一步。
2. 把新學到的經驗補進老師本機的 `經驗庫.md`（症狀／情境 → 做法 → 為什麼）。
3. 交付時附上：變更檔案清單、SQL migration、Vercel 預覽網址、「老師該怎麼測試」的步驟清單（第一步、第二步…）。
4. 明確列出需要老師手動完成的外部設定。
5. 回報後停下，等老師確認再合併 main、再進下一階段。

## 目前階段
舊系統 Phase 1～2.5 與規格書第 1 階段「系統更名與地基」已完成並上線（SQL 已執行、老師實測通過）。第 2 階段「素材庫」已完成並上線（SQL 已執行、老師實測通過）。第 3 階段「畫布編輯器核心」已完成並上線（老師實測通過）。第 4 階段「播放器核心＋事件系統」已完成並上線（老師實測通過）。第 5 階段「答案鎖＋圖層群組」已完成並上線（老師實測通過；圖層群組已完成，滿足「第 7 階段前必須完成」）。第 6 階段「關卡系統＋任務目標＋學習紀錄後台」已完成並上線（老師實測通過；無新 SQL；含發布檢查「去修改」、題目精靈、右鍵選單、全面崩潰掃描、素材庫彈窗與面板收合、地點／物件／題目條件）。第 7 階段「物件互動」已完成（待老師實測、合併 main；無新 SQL）。**下一步：第 8 階段「工作台」**（規格書第十節）。
**老師指定待辦：圖層群組（規格書 6.3）必須在第 7 階段開工前完成**，每階段開工盤點時請確認此項狀態。詳見 `docs/PROGRESS.md`。



## 新系統重點檔案
- `supabase/phase1-missions.sql`：任務系統資料表、RLS、檢視表 `published_missions`、bucket `mission-assets`。
- `src/lib/missions.js`：任務 CRUD、空任務 JSON 骨架；學生端只能讀 `published_missions` 檢視表，不可直接讀 `missions` 表。
- `src/lib/assets.js`：素材上傳（WebP 壓縮、雜湊檔名）、用量、使用中檢查、刪除。**任務 JSON 引用素材一律用 `mission_assets.id` 當 `assetId`**（刪除保護靠它比對）。`supabase/phase2-assets.sql`：`name` 欄位與 `mission_assets_in_use` 函式。
- 編輯器：`src/pages/AdminMissionEditor.jsx`（讀寫 Supabase）→ `src/editor/MissionEditor.jsx`（全螢幕外殼，不碰 Supabase，由 props 傳入草稿、素材、存檔函式）；狀態／復原／自動存檔在 `useMissionEditor.js`；`SceneView.jsx` 以 DOM 繪製場景（播放器要共用它），`SceneCanvas.jsx` 疊 Konva 透明層做互動；`SceneGraph.jsx` 是 react-flow 場景關聯圖。任務 JSON 的結構與預設值在 `src/lib/missionSchema.js`（物件陣列順序＝圖層順序，最後＝最上層）。
- 播放器：`src/pages/MissionPlay.jsx`（學生流程：讀已發布版本→學生資料→預載→續玩詢問）→ `src/player/Player.jsx`（畫面、轉場、訊息、過關）← `src/player/GameEngine.js`（狀態與事件執行器，與 React／Supabase 無關，可用 node 直接測）。事件／條件的規則在 `src/lib/missionEvents.js`（編輯器表單與播放器共用）。新增動作類型時：先在 `missionEvents.js` 的 `ACTION_TYPES`／`newAction` 登記、`GameEngine.runAction` 實作、`EventEditor.jsx` 加表單、`missionCheck.js` 補健檢。
- 答案鎖：判斷與加密在 `src/lib/lockLogic.js`（純函式，可用 node 測；每個題型的判斷同時支援明文與加密後的鎖，`protectLock`／`protectMission` 在發布時呼叫，見 `missions.js` 的 `publishMission`）；引擎的提示／放棄／解開在 `GameEngine`（`submitLock`、`requestHint`、`giveUp`）；學生答題畫面 `src/player/LockDialog.jsx`（全部點選操作）；老師出題介面 `src/editor/LockEditor.jsx`（四個分頁）。新增題型要同時改：`lockLogic.js`（`ANSWER_TYPES`、`newAnswer`、`plainTokens`/`checkAnswer`、`protectLock`、`validateLock`、`lockView`）、`LockDialog.jsx`、`LockEditor.jsx`，並補測試（明文與加密結果必須一致）。`answerDrafts`（切換題型暫存的舊答案）發布時一定要移除。
- 群組與多選：規則在 `src/editor/groupOps.js`（純函式）；物件以 `groupId` 指向場景的 `groups`；引擎的 `groupMembers` 讓「讓東西出現／消失」能以群組為目標。
- 事件編輯器 UX（老師實測後改版，請沿用）：用「進度記號」而不是「旗標」；記號只能從清單選或新增（`EventEditor.jsx` 的 `FlagPicker`），總覽與改名在 `FlagManager.jsx`；條件是句子式列表並自動顯示白話解釋（`ConditionEditor`、`describeCondition`）；步驟是依種類上色的卡片並提供常用範例（`RECIPES`）；物件互動在「外觀／互動」分頁；關卡的開場／過關方式／過關後集中在 `StageDialog.jsx`；圖示庫在 `icons.js`（可中文搜尋）。新增動作時，`ACTION_META`（含圖示、說明、分類顏色）也要補。
- 多關卡（第 6 階段）：任務 JSON 的 `stages[]`＋`stageLinks[]`（規則見 `docs/PROGRESS.md` 第 6 階段）；引擎 `GameEngine` 管解鎖／目標／重置（旗標與目標狀態整任務共用，`goto_scene` 只限同一關）；編輯器 `StageMap.jsx`（關卡圖）、`StageDialog.jsx`（開場／過關／任務目標）、`graphLayout.js`（自動整理）；學生端 `src/player/StageUi.jsx`（關卡地圖畫面、目標欄）；發布健檢 `missionCheck.js` 已改為多關卡版。測試：`tests/stages.test.mjs`。
- 後台任務紀錄：`src/pages/AdminMissionLogs.jsx`（`/admin/logs/mission`）、查詢 `src/lib/missionLogQueries.js`、統計與卡關分析（純函式）`src/lib/missionStats.js`（測試 `tests/mission-stats.test.mjs`）。新增事件類型時，要在 `missionStats.js` 的 `MISSION_EVENT_LABELS`／`describeMissionEvent` 補白話說明。
- 條件（`ConditionEditor`／`evalCondition`／`describeCondition`）：除了進度記號，遊戲自己追蹤「去過的地點 `visited`、點過的物件 `clicked`、解開的題目（`locks[id].solved`）」，條件欄位見 `missionEvents.js` 的 `FACT_KEYS`。新增這類事實時，引擎狀態、判斷、白話說明、重玩重置、發布檢查、`tests/fuzz-data.mjs` 都要一起補。素材庫彈窗 `AssetLibraryDialog.jsx`、左右面板收合（`MissionEditor.jsx` 的 `PanelToggle`）也在編輯器外殼。
- 崩潰測試工具：`tests/fuzz.test.mjs`（亂數壞任務丟進整條流程，已在 `npm test`）、`tests/fuzz-data.mjs`（亂數任務產生器，種子固定）；載入時的資料修復在 `missionSchema.js` 的 `normalizeDraft`（丟掉壞項目、重複 id 換新）與 `lockLogic.js` 的 `repairLock`；友善錯誤頁在 `src/components/CrashPage.jsx`（整頁／面板／缺環境變數三種），錯誤邊界掛在 `main.jsx` 與編輯器右側面板。每個大階段結束建議再做一次全面崩潰掃描（做法見經驗庫）。
- 物品、證物袋、插座、裝置（第 7 階段）：資料在任務 JSON 的 `items`／`combinations` 與物件的 `collectible`／`itemId`／`moveInScene`、`socket`／`device` 類型（預設值與修復在 `missionSchema.js` 的 `createObject`／`repairSocket`／`repairDevice`）；引擎在 `GameEngine` 的「items, the evidence bag, sockets and devices」一段（`collect`、`useItemOnSocket`、`combineItems`、`operateDevice`、`setDeviceState`）；編輯器 `ItemsDialog.jsx`（物品清單與組合）、`KindProperties.jsx`（插座與裝置的屬性）、物件「互動」分頁的 `AbilitiesBlock`（撿起／拖開）；學生端 `src/player/BagUi.jsx`（證物袋抽屜、拖曳、提示小訊息、物品檢視）。新增事件、條件或紀錄種類時同步更新：`ACTION_META`、`describeAction`、`describeCondition`、`missionCheck.js`、`missionStats.js`、`tests/fuzz-data.mjs`。測試：`tests/items.test.mjs`。
- 題目精靈與右鍵選單：`src/editor/LockWizard.jsx`（新增答案鎖時自動打開，直接編輯那一題；新增題型時精靈的題型卡片 `COMMON`/`EXAMPLES` 也要看一下）、`src/editor/ContextMenu.jsx`（通用選單元件），選單內容由 `MissionEditor.jsx` 的 `openObjectMenu`／`openCanvasMenu`／`openSceneMenu` 組出；新增常用物件操作時，請順手加進右鍵選單。
- 紀錄：`src/lib/missionLogQueue.js`（IndexedDB 離線佇列；`createMissionRecorder` 產生遞增流水號）。**流水號與進度存檔必須一起存**（見 MissionPlay 的 `persist`），否則續玩會重複使用流水號而被資料庫丟掉紀錄。
- 發布：編輯器「📢 發布」→ `missionCheck.js` 健檢 → `publishMission()`；是否對學生開放由任務列表的「開放給學生」控制。
- 網址：學生 `/missions`、`/mission/:id`；後台編輯器 `/admin/missions/:id/edit`；後台素材庫 `/admin/assets`；後台 `/admin/missions`、`/admin/mission-categories`；舊版 `/task`、`/battle` 不變。
