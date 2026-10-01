# 科學任務偵探所 — 系統開發規格書 v5

Oct 1, 2026 · @Wu Chang Hsin

## 一、系統定位與總覽

本規格書把現有的「化學偵探學習系統」升級並更名為「科學任務偵探所」，並將《科學鑑識虛擬情境編輯器 v4》整合進同一個系統，成為單一遊戲主機。

核心原則沿用 v4：引擎（編輯器＋播放器）寫一次，換一份任務資料就是一個新遊戲。老師在後台用編輯器自己組裝任務，學生端用同一台播放器遊玩。

### 1.1 四層結構

任務資料由大到小分四層：

1. **任務（Mission）**：一個完整的小遊戲主題，例如「消失的實驗藥品」「失蹤的畫作」
2. **關卡（Stage）**：任務內的一關，可單線或多線排列（第五節）
3. **場景（Scene）**：關卡內的一個空間畫面，場景之間用方向連接（第六節）
4. **積木（Block）**：場景內的物件與互動元件，包含物件、答案鎖、插座、裝置、工作台等

&#91;embedded content: 任務資料四層結構\]

每一層都包含多個下一層：一個任務有多個關卡，一個關卡有多個場景，一個場景放多個積木。

### 1.2 任務分類

所有任務共用同一套編輯器與播放器，只用「分類」區分：

- **化學任務**：針對化學學習痛點（實驗室安全、配藥、濃度計算、pH 計算等）
- **鑑識案件**：探究與實作課程的科學鑑識情境（失蹤案、竊盜案等）
- **密室逃脫**：一般解謎活動
- 分類清單可由老師在後台新增修改

### 1.3 保留的既有功能

- 雙人 PK 對戰模式、對戰題庫、題目編輯器（TipTap、KaTeX、難度、標籤）全部保留，不改動行為
- 既有 Supabase 資料（題目、學生紀錄、對戰紀錄）全部保留
- 舊版「任務闖關」（依題庫出題的 TaskPlay）暫時保留可用，待新任務系統上線後由老師決定是否隱藏

## 二、給 Claude Code 的開發守則

這是一個已上線、正在教學使用的系統，每一步都必須以「不影響現有功能」為前提。

- **現況**：網址 https://chemistry-learning-system.vercel.app ，GitHub repo `puff0223-chwu/chemistry-learning-system`，Supabase 專案 `qpbojgkeatdygjimllzs`（新加坡），技術棧 React + Vite + Vercel + Supabase
- **交接文件**：本規格書存放在 repo 的 `docs/spec-v5.md`；開發進度記在 `docs/PROGRESS.md`；repo 根目錄的 `CLAUDE.md` 是每次新對話的入口說明。每完成一個階段，必須更新 `PROGRESS.md`（完成內容、資料表變更、已知問題、下一步），並把新學到的經驗補進老師本機的 `經驗庫.md`
- **分支開發**：每個階段在獨立分支開發，使用 Vercel 預覽網址測試；老師確認後才合併到 main
- **一次一個階段**：依第十八節順序進行，每完成一個階段就停下，回報完成內容與測試方式，等老師確認再繼續
- **開工前先盤點**：每階段開始前，先讀 `CLAUDE.md`、`PROGRESS.md`、`經驗庫.md`，並檢查與既有功能（對戰、題庫編輯器、學習紀錄、登入）的相容性，有衝突先回報
- **資料安全**：不刪除、不改名既有資料表與欄位；新增欄位一律給預設值；所有資料庫變更寫成 SQL migration 檔存進 repo
- **金鑰**：Supabase 金鑰只放 Vercel 環境變數，不寫進程式碼
- **介面語言**：所有介面文字使用繁體中文

## 三、學生端與老師後台結構

### 3.1 學生端

- **首頁**：系統名稱「科學任務偵探所」＋兩個大入口「🗺️ 任務」「⚔️ 雙人對戰」；右上角低調的「管理登入」
- **任務列表** `/missions`：只顯示已發布且開放中的任務，可依分類篩選，以卡片呈現（封面圖、名稱、分類、預估時間）
- **任務遊玩** `/mission/:missionId`：進入前沿用既有「學生資料填寫視窗」（用途、年級、班級、座號、姓名，sessionStorage 自動帶入），接著預載素材，再進入關卡地圖或第一關
- **直達網址**：每個任務有固定網址，老師可直接產生 QR Code 讓學生掃碼進入該任務
- **雙人對戰** `/battle`：維持現狀

### 3.2 老師後台側邊欄

| 選單 | 子頁面 | 說明 |
| --- | --- | --- |
| 🧩 任務工坊 | 任務列表、情境編輯器、素材庫、分類管理 | 新增、複製、刪除任務；進入編輯器 |
| ⚔️ 對戰題庫 | 題目管理、標籤管理 | 維持現有功能 |
| 📊 學習資料 | 任務紀錄、破關作答與評分、對戰紀錄 | 查詢、篩選、匯出 Excel |
| 📢 發布管理 | 任務開放狀態、QR Code、破關密碼 | 上課時控制開放與進度 |
| ⚙️ 系統設定 | 主題外觀、背景圖、帳號設定 | 既有功能搬移至此 |

- 編輯器與其大型套件（Konva、react-flow）只在後台延遲載入，學生端不下載
- 情境編輯器以全螢幕工作區開啟，桌機優先設計（最小寬度 1280px），不需支援手機編輯

## 四、資料架構

每個任務存成一份 JSON 放在 Supabase，分「草稿」與「已發布」兩份；學生只讀得到已發布版本。

### 4.1 新增資料表

| 資料表 | 主要欄位 | 用途 |
| --- | --- | --- |
| `missions` | id, title, category\_id, cover\_url, status（draft/published/archived）, is\_open, draft\_data jsonb, published\_data jsonb, published\_version int, published\_at, updated\_at | 任務本體 |
| `mission_categories` | id, name, sort\_order | 任務分類，預設「化學任務、鑑識案件、密室逃脫」 |
| `mission_assets` | id, mission\_id（可為空＝共用素材）, storage\_path, type, bytes, width, height, created\_at | 素材庫紀錄 |
| `mission_logs` | id, session\_id, mission\_id, mission\_version, stage\_id, scene\_id, block\_id, event\_type, payload jsonb, client\_ts, seq | 遊玩事件紀錄（第十五節） |
| `mission_submissions` | id, session\_id, mission\_id, answers jsonb, auto\_score, suggested\_score, rubric\_hits jsonb, teacher\_score, teacher\_comment, total\_seconds, hint\_count, submitted\_at | 破關作答與評分 |

- 既有 `student_sessions` 沿用，新增 `mission_id`、`mission_version` 欄位，`mode` 新增值 `mission`
- Storage 新增 bucket `mission-assets`（public 讀取，authenticated 上傳）
- RLS：學生（anon）只能讀取 `status='published' AND is_open=true` 的任務，且只能透過 view `published_missions` 讀到 `published_data`，看不到草稿；logs、submissions、sessions 為 anon INSERT only；老師（authenticated）全權限

### 4.2 任務 JSON 頂層結構

```json
{
  "schemaVersion": 1,
  "missionId": "m_lab_safety",
  "settings": {
    "timeLimitSeconds": null,
    "backgroundMusic": null,
    "notebookCategories": ["現場觀察", "證物特徵", "計算結果"],
    "labCategories": ["物理鑑定", "化學鑑定", "生物科技鑑定", "一般觀察"],
    "giveUpDefault": { "enabled": true, "afterAttempts": 3 }
  },
  "flags": { "hasKey": false },
  "items": [],
  "stages": [],
  "stageLinks": [],
  "finalChallenge": null
}
```

- `items`：任務層級的物品定義（可進證物袋、可放上工作台的東西），含 `properties`（例如質量、體積、濃度）
- 旗標、證物袋、筆記本都是任務層級的全域狀態，跨關卡保留

### 4.3 草稿與發布

- 編輯器存檔只寫入 `draft_data`，不影響上課中的學生
- 按「發布」時：先執行「發布前健檢」（第十七節），通過後把草稿轉成發布版本寫入 `published_data`，`published_version` +1
- 學生開始遊玩時記下當下版本號，寫入 session 與每筆 log，方便日後對照
- `schemaVersion` 用來處理日後引擎升級：播放器讀到舊版本資料時，先經過 migration 函式轉成新格式，舊任務永遠可以玩

### 4.4 答案保護

已發布的資料會被下載到學生平板，懂技術的學生可能打開開發者工具偷看。發布時自動處理：

- 文字、選擇、配對、排序、轉盤、方向等答案：轉成加鹽雜湊值（SHA-256），播放器比對雜湊，不存原文
- 數值答案：存可接受範圍，做基本混淆
- 破關老師密碼：只存雜湊
- 解析與「我真的不會」的完整答案：另外加密存放，只在學生按下時解開
- 目標是擋住一般偷看，不追求銀行等級保護

## 五、關卡系統

一個任務可以切成多個關卡，老師在「關卡地圖」上用連線決定關卡順序，同一套機制同時支援單線與多線設計。

### 5.1 關卡資料

```json
{
  "stageId": "st_2",
  "title": "第二關：配製溶液",
  "intro": "<p>TipTap 富文字，關卡開場說明</p>",
  "startSceneId": "sc_bench",
  "scenes": [],
  "objectives": [],
  "completeWhen": { "allFlags": ["solutionReady"] },
  "onComplete": [{ "action": "show_message", "message": "溶液配製完成！" }],
  "resetOnRetry": false
}
```

- `completeWhen`：過關條件，使用第七節的條件語法（旗標、物品、目標完成數）；也可由積木事件 `complete_stage` 直接觸發
- `resetOnRetry`：學生重玩此關時，是否重置本關內的旗標與物品位置

### 5.2 關卡連線（stageLinks）

```json
[
  { "from": "st_1", "to": "st_2" },
  { "from": "st_2", "to": "st_3a", "when": { "flag": "choseAcid" } },
  { "from": "st_2", "to": "st_3b", "when": { "flag": "choseBase" } },
  { "from": ["st_3a", "st_3b"], "to": "st_4", "join": "any" }
]
```

支援四種排法，全部用同一種連線資料表達：

1. **單線**：1 → 2 → 3，完成前一關才解鎖下一關
2. **分支**：依學生的選擇或旗標走向不同關卡（`when`），可做出不同結局
3. **並行**：同時解鎖多個關卡，學生自由選順序（一個 `from` 連到多個 `to`，都不帶條件）
4. **匯合**：多個關卡完成後才解鎖下一關；`join: "all"` 要全部完成，`join: "any"` 完成任一即可

### 5.3 編輯器：關卡地圖

- 用 react-flow 呈現，每個關卡是一個節點，拖曳連線建立 stageLinks，點連線可設定條件
- 點兩下關卡節點進入該關的「場景關聯圖」，再點場景進入畫布編輯
- 關卡可複製、刪除、重新命名；只有一關的任務自動隱藏關卡地圖，操作更簡單

### 5.4 播放器：學生看到的關卡地圖

- 顯示所有關卡的狀態：🔒 未解鎖、▶ 可遊玩、✅ 已完成
- 老師可設定「隱藏未解鎖關卡」，增加神秘感
- 通關一關後回到關卡地圖，或設定「自動進入下一關」
- 已完成的關卡可重玩（依 `resetOnRetry` 決定是否重置）

## 六、場景與畫布編輯器

場景採 2D 圖片場景＋方向切換動畫，編輯方式是類似 Genially 的所見即所得畫布：拖入素材、直接用滑鼠移動與縮放。

### 6.1 場景資料

```json
{
  "sceneId": "sc_lab",
  "sceneType": "normal",
  "background": { "type": "image", "assetId": "a_lab01" },
  "backgroundMusic": null,
  "exits": { "up": null, "down": null, "left": "sc_storage", "right": null, "forward": "sc_hood", "backward": null },
  "exitConditions": { "forward": { "flag": "wearingGoggles" } },
  "objects": []
}
```

- `sceneType`：`normal`（一般）、`lab`（鑑識中心，第十二節）、`finalChallenge`（破關，第十四節）
- 轉場動畫：左右＝水平滑動；前後＝淡入淡出加輕微縮放；上下＝垂直滑動
- `exitConditions`：出口可加條件，未達成時顯示老師設定的訊息（例如「先戴上護目鏡才能靠近抽氣櫃」）
- `background.type` 預留 `panorama`，未來可升級 360 環景而不改資料結構
- 所有素材以 `assetId` 引用素材庫，不直接寫網址，換圖不必逐一修改

### 6.2 畫布與物件

- 畫布固定邏輯尺寸 1600×900（16:9），播放時等比縮放到螢幕，平板橫向為主要遊玩裝置
- 物件類型：`image`、`video`、`icon`、`text`（支援 TipTap 富文字與 KaTeX 化學式）、`hotspot`（隱形點擊區）、`audioZone`、以及互動積木 `lock`、`socket`、`device`、`workbench`、`widget`（第八到十、十六節）
- 共通屬性：位置、尺寸、旋轉、透明度、`zIndex`、`visible`（初始是否顯示）、`showWhen`（顯示條件）、`onClick`（事件清單）、`onClickSound`

### 6.3 編輯器功能

- 左側：素材庫與積木清單，拖曳放入畫布
- 中間：畫布，支援拖曳、縮放、旋轉、對齊參考線
- 右側：屬性面板，設定所選物件的屬性、條件與事件
- 圖層面板：上移、下移、移到最上／最下、鎖定、隱藏、群組
- 復原／重做（至少 50 步），以操作紀錄實作
- 存檔：右上角「💾 儲存」按鈕（快捷鍵 Ctrl+S）可隨時手動存檔，並顯示「已儲存 HH:MM」或「尚有未儲存的變更」；另外每 30 秒及每次重要操作後自動存草稿到 Supabase；網路斷線時先存瀏覽器，恢復後補存，並顯示存檔狀態
- 預覽模式：編輯器內一鍵「從這個場景開始試玩」，可手動切換旗標與物品，方便測試
- 任務可整份複製（做範本用），也可匯出／匯入 JSON 備份檔

## 七、統一事件與條件系統

所有積木觸發後要做的事，都用同一份「事件動作清單」描述；所有「什麼時候可以」都用同一套條件語法。引擎只寫一套執行器，所有積木共用。

### 7.1 事件動作（action）

| action | 參數 | 效果 |
| --- | --- | --- |
| `show_message` | message, notebook? | 顯示訊息，可附帶筆記記錄提議 |
| `goto_scene` | sceneId, transition? | 切換場景 |
| `reveal_object` / `hide_object` | target | 顯示／隱藏物件 |
| `set_flag` / `clear_flag` | flag | 設定／清除旗標 |
| `add_item` / `remove_item` | itemId | 物品進出證物袋 |
| `set_state` | target, state | 改變裝置或物件狀態（第八節） |
| `swap_background` | sceneId, assetId | 更換場景背景 |
| `play_sound` | assetId | 播放音效 |
| `add_notebook` | category, entryText, mode | 新增筆記 |
| `complete_objective` | objectiveId | 完成任務目標（第十一節） |
| `open_lock` / `open_workbench` | target | 開啟答案鎖或工作台 |
| `complete_stage` | stageId? | 完成目前（或指定）關卡 |
| `delay` | ms | 等待後再執行清單中的下一個動作 |

事件欄位一律是陣列，依序執行，例如 `onSuccess: [{set_flag}, {reveal_object}, {show_message}]`。

### 7.2 條件（condition）

```json
{
  "allFlags": ["hasKey"],
  "anyFlags": [],
  "notFlags": ["alarmOn"],
  "hasItems": ["item_beaker"],
  "objectivesDone": ["obj_1"],
  "notebookCountAtLeast": 3,
  "elapsedSecondsAtLeast": null
}
```

- 欄位全部選填，有填的必須全部成立
- 用在：物件 `showWhen`、出口 `exitConditions`、關卡 `completeWhen`、關卡連線 `when`、破關按鈕出現條件、事件的 `if` 分支
- 事件也可寫條件分支：`{ "if": {條件}, "then": [動作], "else": [動作] }`

### 7.3 編輯器介面

老師不需要寫 JSON：屬性面板用下拉選單＋表單組合事件與條件（「當…時」→「做…」），旗標、物品、場景都從清單中挑選，避免打錯字。

## 八、物件互動：翻找、收集、插座、裝置開關

拖曳類互動全部由三種積木組合而成：物件的兩個開關、插座、裝置。滑鼠與觸控使用同一套程式（Konva.js）。

### 8.1 物件的兩個開關

- `moveInScene: true`：可在場景內自由拖動，用來翻找（移開上層物件露出底下的線索），位置不需存檔
- `collectible: true` ＋ `itemId`：點擊或拖到證物袋圖示即收進證物袋，並從場景消失

### 8.2 插座（socket）

把物品拖到定點觸發事件，鑰匙孔、保險箱、比對台、試管架都是插座。

```json
{
  "type": "socket",
  "objectId": "sk_keyhole",
  "accepts": ["item_key"],
  "consumeItem": true,
  "onMatch": [{ "action": "set_state", "target": "dev_cabinet", "state": "open" }],
  "onWrongItem": [{ "action": "show_message", "message": "好像插不進去…" }],
  "hints": ["找找看有沒有鑰匙"]
}
```

- 物品可從場景或證物袋拖入插座
- 比對型解謎（指紋、筆跡比對）也用插座實作，只是外觀換成比對畫面

### 8.3 裝置（device）：開關與狀態

可切換狀態的物件，例如酒精燈、抽氣櫃、電燈、櫃門、儀器電源。

```json
{
  "type": "device",
  "objectId": "dev_hood",
  "states": [
    { "id": "off", "assetId": "a_hood_off" },
    { "id": "on", "assetId": "a_hood_on", "sound": "a_fan" }
  ],
  "initialState": "off",
  "clickToCycle": true,
  "operateWhen": { "allFlags": ["powerOn"] },
  "onState": { "on": [{ "action": "set_flag", "flag": "hoodOn" }] }
}
```

- 每個狀態有自己的外觀圖與音效
- `clickToCycle`：學生點擊就切換到下一個狀態；設 false 時只能由其他積木用 `set_state` 改變（例如答案鎖解開後櫃門才打開）
- `operateWhen`：可操作的條件，未達成時顯示提示訊息
- `onState`：進入某狀態時觸發事件，可用來連動下一個開關，形成連鎖機關

## 九、答案鎖

答案鎖是 v4 密碼鎖的升級版：一個鎖、多種解鎖方式、共用同一套提示與放棄機制。它可以附加在場景、物件、裝置上，也可以單獨擺在場景裡成為一張題目卡。

### 9.1 共通結構

```json
{
  "type": "lock",
  "lockId": "lk_conc",
  "prompt": "<p>TipTap 富文字題目，可含圖片與 KaTeX</p>",
  "answerType": "number",
  "answer": {},
  "hints": ["提示一", "提示二", "提示三"],
  "hintMode": "onWrong",
  "giveUp": { "enabled": true, "afterAttempts": 3 },
  "explanation": "<p>完整解析與答案</p>",
  "wrongFeedback": [{ "match": "0.01", "message": "單位換算再檢查一次" }],
  "onSuccess": [{ "action": "set_state", "target": "dev_door", "state": "open" }],
  "onGiveUp": [],
  "lockAfterSolved": true
}
```

### 9.2 解鎖方式（answerType）

| answerType | 學生操作 | answer 設定內容 | 適用例子 |
| --- | --- | --- | --- |
| `text` | 輸入中文、英文或數字 | 可接受答案清單；忽略大小寫、全形半形、前後空白、標點（各自可開關）；化學式下標正規化（H₂O = H2O） | 密碼、物質名稱、化學式 |
| `number` | 輸入數值（可選單位） | 正確值；容許誤差（絕對值或百分比）；可接受單位清單；是否必填單位 | 濃度、pH、質量計算 |
| `choice` | 單選 | 選項（文字或圖片）＋正解 | 概念判斷 |
| `multiChoice` | 複選 | 選項＋正解組合 | 找出所有危險行為 |
| `match` | 左右兩欄連線或拖曳配對 | 左項、右項（文字或圖片）＋正確配對 | 器材圖配名稱、試劑配危險標示 |
| `order` | 拖曳排出順序 | 項目（文字或圖片）＋正確順序；顯示時自動打亂 | 配藥步驟、實驗流程 |
| `categorize` | 把卡片拖進分類框 | 分類、項目與所屬分類 | 酸／鹼／中性分類、廢液分類 |
| `hotspot` | 在圖片上點出正確位置 | 圖片＋正確區域（可多個） | 找出圖中的違規處 |
| `dial` | 轉盤密碼（每格上下轉） | 格數＋每格字元集（數字、字母、自訂如元素符號）＋正解 | 密室逃脫經典鎖 |
| `direction` | 按方向鍵輸入序列 | 方向序列（上下左右） | 方向鎖 |

- 配對、排序、分類的評分方式可選：全對才算過，或顯示「對了幾個」讓學生調整
- 所有文字選項都可改用圖片，圖片選項可加說明文字

### 9.3 提示與放棄機制

- `hintMode: "onWrong"`（化學任務預設）：答錯 → 提示一 → 再試；再錯 → 提示二 → 再試；再錯 → 提示三 → 再試；第三次後同時出現「繼續提示」與「我真的不會」
- `hintMode: "onRequest"`（鑑識案件、密室逃脫常用）：畫面上有「💡 提示」按鈕，學生主動按才逐層顯示
- 「我真的不會」：顯示 `explanation`（完整解析與答案）並執行 `onGiveUp` 事件，但**不會直接過關**。學生看完解析後，必須在同一個答案鎖自己再作答一次，系統確認正確才執行 `onSuccess`、劇情繼續
  - 解析在作答區旁保持可展開，學生可對照
  - 看完解析後的作答不再給新提示；答錯只顯示「再對照一次解析」
  - 配對、排序、分類、工作台等操作型題目，同樣要學生自己重新操作一次
- 紀錄標記：按下時寫入 `give_up`；之後答對寫入 `lock_solved` 並帶 `afterGiveUp: true`。後台摘要的「放棄次數」照算，該題標示為「放棄後完成」，與自行解出的題目分開統計
- `giveUp.enabled` 可關閉，適合不希望學生看答案的關鍵鎖
- 每次作答、每層提示、放棄都寫入 logs（第十五節）

## 十、工作台

工作台是場景中指定的一塊區域，學生點擊後放大成操作面板，在裡面組裝器材或操作實驗；完成後觸發事件，例如打開開關或解鎖下一個目標。

### 10.1 工作台的零件

工作台面板由五種零件組成，老師在面板裡用拖放擺位：

| 零件 | 說明 | 例子 |
| --- | --- | --- |
| 放置位（slot） | 可放入指定物品的位置，可限定接受哪些物品 | 天平秤盤、鐵架上的燒瓶位置 |
| 台上物品（benchItems） | 工作台本身提供的器材，不必從證物袋拿 | 燒杯、量筒、藥匙 |
| 控制元件（controls） | 按鈕、開關、滑桿、旋鈕、數字輸入 | 加水量滑桿、酒精燈旋鈕、歸零鍵 |
| 顯示器（displays） | 顯示數值或狀態文字，隨操作即時變化 | 天平讀數、溫度計、pH 計 |
| 容器外觀（visuals） | 依狀態換圖，例如液面高度、顏色變化 | 容量瓶刻度、指示劑變色 |

物品可帶屬性（`properties`，例如 mass、volume、concentration、color），顯示器可顯示：某控制元件的值、某放置位內物品屬性的加總、或依狀態對應的文字。

### 10.2 四種判定模式

一個工作台選一種主模式，也可組合：

1. **組裝（assembly）**：所有放置位都放對物品即完成；可設定是否要求順序
2. **步驟（procedure）**：依正確步驟順序操作（放入某物、按某鈕、把某控制元件調到某範圍）；每一步即時判定，做錯時顯示該步提示，可設定「做錯一步要重來」或「只退回這一步」
3. **調整（adjust）**：把控制元件或顯示器數值調到目標範圍內，例如天平讀數 5.00 ± 0.02 g、加水到 100 mL 刻度
4. **合成（combine）**：把 A、B 放進反應位 → 產生新物品 C 進入證物袋，並顯示反應畫面，例如混合溶液產生沉澱

### 10.3 資料範例：固體秤量

```json
{
  "type": "workbench",
  "objectId": "wb_balance",
  "area": { "x": 900, "y": 420, "w": 380, "h": 260 },
  "panelBackground": "a_bench_bg",
  "mode": "procedure",
  "slots": [{ "slotId": "pan", "accepts": ["item_paper", "item_nacl"] }],
  "controls": [{ "controlId": "tare", "kind": "button", "label": "歸零" }],
  "displays": [{ "displayId": "reading", "source": { "sumProperty": "mass", "slot": "pan", "minusTare": true }, "format": "0.00 g" }],
  "steps": [
    { "do": "place", "item": "item_paper", "slot": "pan", "hint": "先放稱量紙" },
    { "do": "press", "control": "tare", "hint": "放了稱量紙之後要先做什麼？" },
    { "do": "reach", "display": "reading", "min": 4.98, "max": 5.02, "hint": "目標是 5.00 g" }
  ],
  "onWrongStep": "retryStep",
  "onComplete": [
    { "action": "add_item", "itemId": "item_nacl_5g" },
    { "action": "complete_objective", "objectiveId": "obj_weigh" }
  ]
}
```

- 工作台同樣支援第九節的提示層級與「我真的不會」
- 每個操作（放入、取出、按鈕、數值變化、步驟對錯）都寫入 logs，可看出學生卡在哪一步
- 工作台未完成可隨時關閉，下次打開保留目前狀態

### 10.4 同類功能一併納入

- **物品組合**：在證物袋裡把兩個物品拖在一起合成新物品（例如「滴管＋試劑瓶＝裝好試劑的滴管」），不必開工作台
- **物品檢視**：證物袋裡的物品可點開放大、旋轉看不同角度的圖，並可在放大圖上設隱藏線索熱點
- **連鎖機關**：工作台完成 → 裝置狀態改變 → 下一個裝置可操作，全部靠第七節的事件串起來
- 特別複雜、需要真實模擬的操作（例如滴定曲線、分子模型）不硬塞進工作台，改用第十六節的特製積木

## 十一、任務目標與提示連動

每個關卡有一份「任務目標」清單，畫面上常駐一個目標欄，告訴學生現在該做什麼；完成一個目標後自動出現下一個目標與它的提示。

```json
{
  "objectiveId": "obj_weigh",
  "text": "秤取 5.00 g 氯化鈉",
  "visibleWhen": { "objectivesDone": ["obj_safety"] },
  "doneWhen": { "hasItems": ["item_nacl_5g"] },
  "hints": ["工作台上的天平可以用", "記得先放稱量紙再歸零"],
  "onDone": [{ "action": "show_message", "message": "很好！接下來要溶解它。" }]
}
```

- 目標完成方式二選一：`doneWhen` 條件自動判定，或由積木事件 `complete_objective` 觸發
- `visibleWhen` 讓目標依序浮現，形成「解完這個才看到下一個」的連動
- 目標可設為隱藏目標（完成才顯示，當作彩蛋）
- 目標欄的「💡」按鈕顯示目前目標的提示，逐層給出
- 關卡的 `completeWhen` 常用寫法：`{ "objectivesDone": [所有必要目標] }`

## 十二、筆記本、證物袋、鑑識中心

這三者沿用 v4 設計，都是任務層級的常駐介面，跨場景與跨關卡保留內容。老師可在任務設定中個別開關（例如化學任務可只開證物袋、不開鑑識中心）。

### 12.1 證物袋

- 畫面常駐按鈕，點開顯示已收集物品；物品可拖出來使用（插座、工作台、送驗）
- 支援第十節的物品組合與物品檢視

### 12.2 筆記本

- 分類由老師在任務設定中定義（`notebookCategories`）
- 任何事件都可附帶記錄提議，`mode` 三種：`ask`（詢問學生要不要記錄）、`auto`（自動記錄）、`none`（只顯示訊息）
- 筆記依分類分頁呈現，破關時可回頭翻閱

```json
{ "action": "show_message", "message": "抽屜被翻亂了。", "notebook": { "mode": "ask", "category": "現場觀察", "entryText": "客廳抽屜遭翻動" } }
```

### 12.3 鑑識中心（sceneType: lab）

- 一般場景加上送驗介面：從證物袋選一件證物 ＋ 選檢驗類別 → 依對照表顯示結果文字與結果圖
- 檢驗類別由任務設定 `labCategories` 定義，預設物理、化學、生物科技、一般觀察，化學任務可改成「沉澱反應、焰色試驗、指示劑」等
- 類別選錯顯示 `labWrongCategoryMessage`；結果可自動寫入筆記並設定旗標

```json
{
  "testId": "test_blood_bio",
  "acceptsItem": "item_bloodstain",
  "category": "生物科技鑑定",
  "resultText": "血跡 DNA 與嫌疑人 B 相符",
  "resultAssetId": "a_dna_report",
  "onComplete": [{ "action": "set_flag", "flag": "bloodAnalyzed" }, { "action": "add_notebook", "category": "生物證據", "entryText": "血跡 DNA 與嫌疑人 B 相符", "mode": "auto" }]
}
```

## 十三、計時、時間軸、音樂音效

### 13.1 計時

- 進入任務開始計時，並分別記錄每個關卡的花費時間
- `settings.timeLimitSeconds`：選用的整體倒數，時間到可設定事件（例如跳到失敗結局或只提醒）
- 關卡也可設自己的倒數（`stage.timeLimitSeconds`）

### 13.2 時間軸事件

```json
{ "timeline": [
  { "atSeconds": 300, "do": [{ "action": "swap_background", "sceneId": "sc_lab", "assetId": "a_lab_dark" }] },
  { "atSeconds": 600, "do": [{ "action": "reveal_object", "target": "obj_hidden_clue" }] }
]}
```

- 時間軸可掛在任務層級（從任務開始算）或關卡層級（從進入該關算）

### 13.3 音樂與音效

- 背景音樂可設在任務、關卡或場景層級，由小範圍覆蓋大範圍；切換場景時同一首不重播、不同首則淡出換曲
- 物件點擊音效、答對答錯音效、收集物品音效；系統內建一組預設音效，老師可替換
- 畫面常駐靜音按鈕；iPad 等裝置須在學生第一次點擊後才能播放聲音，播放器在「開始任務」按鈕處解鎖音訊

## 十四、破關關卡與評分

破關沿用 v4 設計，差別在作答結果改存 Supabase，老師在後台直接看與改分，不再經過 Google Apps Script。

### 14.1 流程

1. 「準備破關」按鈕在條件達成時出現（第七節條件，例如筆記 8 筆以上且所有證物已送驗）
2. 學生按下後需輸入老師的破關密碼；老師可在「發布管理」隨時更換密碼，讓全班在同一時間點統一進入
3. 進入破關場景作答，送出後顯示老師設定的結案畫面（可依分數或選擇導向不同結局）

### 14.2 題型與計分

- **選擇題**：自動計分
- **答案鎖題型**：第九節所有 answerType 都可當破關題，自動計分
- **簡答題**：Rubric 關鍵字比對，產生建議分數，最終由老師確認

```json
{
  "questionId": "q2",
  "type": "shortAnswer",
  "prompt": "請說明你的推理過程",
  "points": 10,
  "rubric": [
    { "criterion": "提到血跡方向或噴濺角度", "keywords": ["血跡方向", "噴濺", "角度"], "points": 3 },
    { "criterion": "提到時間矛盾或不在場證明", "keywords": ["不在場", "時間", "矛盾"], "points": 3 },
    { "criterion": "提到嫌疑人動機", "keywords": ["動機", "原因"], "points": 4 }
  ]
}
```

### 14.3 作答回收與老師評分

- 送出內容寫入 `mission_submissions`：學生資料、每題作答、自動分數、簡答建議分數、命中檢核點、總時間、提示使用次數
- 送出失敗時存在平板上並自動重試，學生畫面顯示「已送出」前須確認寫入成功
- 後台「破關作答與評分」頁：依任務、班級篩選；簡答題顯示學生原文並以螢光標出命中關鍵字；老師可逐題調整分數、寫評語，存為 `teacher_score`
- 可匯出 Excel（每位學生一列）

## 十五、學習紀錄與後台資料

任務遊玩的每個重要動作都寫入 `mission_logs`，後台「任務紀錄」頁比照現有「任務關卡資料」頁的操作方式。

### 15.1 事件類型（event\_type）

| 類別 | 事件 |
| --- | --- |
| 流程 | mission\_start、stage\_start、stage\_complete、scene\_enter、mission\_complete、mission\_quit |
| 答案鎖 | lock\_attempt（含作答內容與對錯）、hint\_shown（第幾層）、give\_up、lock\_solved |
| 工作台 | bench\_open、bench\_action（放入、取出、按鈕、數值）、bench\_step\_wrong、bench\_complete |
| 物件 | item\_collect、socket\_match、socket\_wrong、device\_state、object\_click（老師勾選「要記錄」的物件才記） |
| 其他 | objective\_done、notebook\_add、lab\_test、final\_submit |

### 15.2 寫入方式

- 事件先進入平板上的佇列（存在瀏覽器 IndexedDB），每 5 秒或累積 20 筆批次寫入；網路失敗自動重試，網路恢復後補送
- 每筆帶 `client_ts` 與遞增 `seq`，確保順序正確、重送不重複（以 session\_id＋seq 做唯一鍵）
- 學生遊玩進度（目前關卡、場景、旗標、證物袋、筆記）同步存在平板上，重新整理頁面可接續，不必重來

### 15.3 後台「任務紀錄」頁

- 篩選：日期、任務、分類、關卡、用途、年級、班級、姓名
- 摘要表：每位學生的完成關卡數、總時間、答錯次數、提示使用數、放棄次數
- 展開可看完整時間軸
- **卡關分析**：每個答案鎖、工作台步驟的答錯率與平均嘗試次數，一眼看出全班卡在哪
- 匯出 Excel（摘要＋完整紀錄）；單筆與批次刪除，比照現有對戰與任務資料頁

## 十六、特製積木插槽

遇到工作台做不到的真實模擬（例如滴定曲線、分子模型、光譜分析），由 Claude Code 另外寫成一個「特製積木」，老師在編輯器裡像一般積木一樣放進場景。

- 每個特製積木放在 `src/widgets/<名稱>/`，並在 `widgets/registry.js` 註冊名稱、圖示、可設定參數清單
- 編輯器依註冊的參數清單自動產生設定表單，老師不需碰程式
- 播放器傳給特製積木：`config`（老師設定的參數）、`state`（目前任務狀態唯讀）
- 特製積木只能透過三個出口回報：`onSuccess()`、`onFail(reason)`、`log(eventType, payload)`；成功後執行老師在編輯器設定的事件清單
- 特製積木不得直接讀寫 Supabase 或修改任務狀態，確保一個積木出錯不會拖垮整個遊戲

```json
{ "type": "widget", "widgetName": "titration", "config": { "acid": "HCl", "acidConc": 0.1, "targetPH": 7 }, "onSuccess": [{ "action": "set_flag", "flag": "titrationDone" }] }
```

## 十七、穩定度與效能要求

目標是在教室 Wi-Fi 不穩、30 台平板同時使用的情況下，仍然流暢、不掉資料，並維持 Supabase 免費方案。

### 17.1 素材與流量

Supabase 免費方案限制：檔案儲存 1 GB、每月流量約 5 GB（另有 5 GB 快取流量）、專案閒置 7 天會暫停（[來源](https://www.cloudzero.com/blog/supabase-pricing/)）。素材是最大的流量來源，因此：

- 上傳圖片時在瀏覽器端自動壓縮為 WebP，長邊最大 1920px，目標單張 300 KB 以內
- 影片單檔上限 20 MB；較長影片建議改用 YouTube 不公開連結嵌入（`video` 物件支援 YouTube 網址）
- 音訊轉為 MP3／AAC，單檔上限 3 MB
- 素材設定長效快取標頭（Cache-Control 一年），檔名含內容雜湊，換圖就換檔名
- 素材庫頁面顯示總用量與各任務用量，超過 800 MB 時提醒
- 刪除任務時提示是否一併刪除只屬於該任務的素材

**超量預警與付費提醒**：系統要在需要付費之前主動通知老師，並給出調整建議。

- 後台新增「⚙️ 系統設定 → 用量監控」頁：顯示檔案儲存（加總 `mission_assets.bytes`）、資料庫大小（以 RPC 查詢 `pg_database_size`）、本月預估流量（依任務開啟次數 × 該任務素材大小估算），並附上 Supabase 官方 Usage 頁連結供核對實際數字
- 任一項達 70% 時，後台頂部顯示黃色提醒；達 90% 顯示紅色警告，登入時跳出提醒視窗
- 提醒內容附調整建議，依效果排序：壓縮或刪除未使用素材、長影片改 YouTube 嵌入、匯出並清理舊學期 logs、最後才是升級 Supabase Pro（每月 25 美元）
- 系統不會自動升級或產生任何費用，付費與否由老師決定

### 17.2 載入流暢

- 進入任務先載入 `published_data`，再預載第一關所有素材並顯示進度條；遊玩中背景預載下一關
- 學生端與後台分開打包（code splitting），編輯器相關套件不進入學生端
- 場景切換動畫期間不發出網路請求

### 17.3 資料不遺失

- logs 與破關作答走第十五節的離線佇列與重試機制
- 遊玩進度存在平板上，重新整理可接續
- 編輯器自動存草稿，斷線時先存瀏覽器，恢復後補存

### 17.4 不因錯誤整個當掉

- 播放器每個積木包在 React Error Boundary 中，單一積木出錯只顯示「此物件暫時無法使用」，遊戲可繼續，並把錯誤寫入 log
- 讀到缺少的素材時顯示佔位圖，不中斷

### 17.5 發布前健檢

按「發布」時自動檢查，有錯誤不能發布、有警告可確認後發布：

- 錯誤：出口或事件指向不存在的場景、物件、物品；答案鎖沒有設定答案；關卡連線形成無法到達的關卡；起始場景未設定
- 警告：素材過大、提示少於一層、沒有任何可完成關卡的路徑、旗標被使用但從未被設定

### 17.6 服務維持

- 老師已設定外部 cron-job，每 3 到 4 天對 Supabase 發送請求，避免閒置被暫停；本次開發不另建保活機制，避免重複
- 第 12 階段時確認：cron-job 打的網址與資料表在新架構下仍有效、執行紀錄正常，必要時改成查詢輕量的 health 端點

## 十八、開發階段

共 12 個階段，每階段都是可以實際操作測試的完整成果。做完第 6 階段就能產出第一個可上課使用的化學任務。

1. **系統更名與地基**：首頁與標題改為「科學任務偵探所」；後台側邊欄依第三節重整（既有頁面搬移，功能不變）；建立第四節的新資料表、RLS、Storage bucket、`student_sessions` 新欄位；任務列表頁（新增、複製、刪除、分類）；草稿／發布狀態欄位
2. **素材庫**：上傳、瀏覽器端壓縮、用量統計、刪除保護
3. **畫布編輯器核心**：場景新增、背景設定、物件放置（image、video、icon、text、hotspot）、屬性面板、圖層面板、復原重做、自動存草稿、場景關聯圖與方向出口
4. **播放器核心＋事件系統**：學生任務列表、學生資料視窗、預載進度條、場景切換動畫、第七節事件與條件執行器、離線 log 佇列、遊玩進度保存、Error Boundary、編輯器內預覽試玩
5. **答案鎖**：第九節全部 10 種解鎖方式、提示與放棄機制、答案保護（發布時雜湊化）、發布前健檢
6. **關卡系統＋任務目標＋學習紀錄後台**：關卡地圖（編輯器與學生端）、單線／分支／並行／匯合、任務目標欄、後台任務紀錄頁與卡關分析、Excel 匯出　**← 里程碑：可上線第一個化學任務（實驗室安全、濃度或 pH 計算類；配藥類需等第 8 階段工作台）**
7. **物件互動**：翻找、收集、證物袋、插座、裝置狀態、物品組合與檢視
8. **工作台**：第十節四種模式、物品屬性、顯示器與控制元件
9. **筆記本＋鑑識中心**
10. **計時、時間軸、音樂音效**
11. **破關關卡＋作答回收＋後台評分頁**　**← 里程碑：可製作完整鑑識案件**
12. **特製積木插槽＋發布管理頁**（開放開關、QR Code、破關密碼更換）＋ 確認既有 cron-job 保活設定仍正常＋用量監控頁

每階段交付時請 Claude Code 附上：變更檔案清單、SQL migration、Vercel 預覽網址、老師該怎麼測試的步驟清單。

## 十九、技術棧與未來擴充

### 19.1 技術棧

| 用途 | 技術 |
| --- | --- |
| 前端框架 | React + Vite（沿用） |
| 部署 | Vercel（沿用，分支自動產生預覽網址） |
| 資料庫、登入、檔案 | Supabase：PostgreSQL、Auth、Storage（沿用） |
| 畫布編輯與播放 | Konva.js（react-konva），滑鼠與觸控共用 |
| 關卡地圖、場景關聯圖 | react-flow |
| 音訊 | howler.js |
| 富文字與化學式 | TipTap + KaTeX（沿用題目編輯器元件） |
| 安全渲染 | DOMPurify（沿用） |
| 離線佇列與進度 | IndexedDB（可用 idb-keyval 等輕量套件） |
| 圖片壓縮 | 瀏覽器端 Canvas 轉 WebP |
| Excel 匯出 | SheetJS（沿用） |

### 19.2 未來擴充（本次不做，架構已預留）

- **多位老師使用**：Supabase Auth 新增帳號；`missions` 加上 `owner_id` 與 RLS 即可各自管理任務
- **任務範本庫**：老師之間分享與複製任務
- **AI 輔助評分**：簡答題串接 AI 模型給評分建議，需以 Supabase Edge Function 保管 API 金鑰
- **360 環景場景**：`background.type: panorama`
- **題庫連動**：答案鎖可從對戰題庫依標籤抽題
- **獨立專案**：要公開分享給其他學校時，再評估從現有 repo 拆出
