# 化學偵探學習系統

React + Vite + Tailwind CSS + Supabase 打造的化學學習網頁應用，含任務闖關模式、雙人 PK 對戰模式與老師後台。

## 本機開發

```bash
npm install
cp .env.example .env   # 填入你的 Supabase 專案資訊
npm run dev
```

## 環境變數

| 變數 | 說明 |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase 專案 URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase 的 publishable (anon) key，前端讀取資料用 |
> 注意：`.env` 已加入 `.gitignore`，不會被推上 GitHub。
>
> 老師登入的 Email 不是環境變數：登入頁預填的 Email 寫死在 `src/lib/supabase.js`（`DEFAULT_ADMIN_EMAIL`），必須和 Supabase Auth 帳號的 Email 一致；密碼只存在 Supabase Auth。舊版曾用 `VITE_ADMIN_EMAIL`、`VITE_ADMIN_PASSWORD`，現在程式不再讀取，可以從 Vercel 刪除。

## 資料庫設定（Supabase）

1. 到 Supabase 專案的 **SQL Editor**，貼上並執行 [`supabase/schema.sql`](supabase/schema.sql)，建立 `topics`、`questions` 兩張表與 RLS policies。
2. 到 **Authentication → Users**，確認已建立老師登入帳號，且它的 Email 與 `src/lib/supabase.js` 的 `DEFAULT_ADMIN_EMAIL` 相同。
3. 執行 [`supabase/logs.sql`](supabase/logs.sql) 建立學生使用紀錄的三張表（`student_sessions`、`task_logs`、`battle_logs`）與權限。學生端只能寫入，只有登入的老師能在「📊 學習資料」查詢與匯出。
4. 執行 [`supabase/editor-upgrade.sql`](supabase/editor-upgrade.sql)：題目難度、內容標籤（`tags`）與外觀設定（`settings`）。
5. 到 **Storage** 建立兩個 **public** bucket：`question-images`（題目圖片）、`site-backgrounds`（背景圖），再執行 [`supabase/storage.sql`](supabase/storage.sql) 開放登入的老師上傳。
6. （可選）執行 [`supabase/seed.sql`](supabase/seed.sql) 插入示範資料，或直接透過老師後台新增。

### 為什麼老師後台用 Supabase Auth 登入，而不是規格書寫的「純前端密碼比對＋secret key」？

這是一個純前端（Vite 靜態網站）專案，沒有後端伺服器。如果照原規格把 Supabase 的 **secret key**（等同 service role，能繞過所有 RLS、讀寫整個資料庫）放進 `VITE_` 開頭的環境變數，它就會被打包進瀏覽器可以看到的 JS 檔案裡，任何人打開瀏覽器開發者工具都能拿到這把 key，等於整個資料庫（不只 topics/questions 兩張表）都會被任何訪客完全開放讀寫。

為了避免這個風險，老師後台改用 Supabase Auth 的帳號密碼登入：老師在登入頁輸入 Email（已預填）與密碼，向 Supabase 登入，取得真正的 `authenticated`身份，這樣 RLS 政策才能正確地「只有登入者能寫入」。Secret key 只在建立這個登入帳號時使用一次，不會出現在任何程式碼或 `.env` 裡。

### 老師密碼

密碼的儲存位置是 Supabase Auth。

- 修改密碼：登入後台 → 「⚙️ 帳號設定」→ 修改登入密碼。
- 忘記密碼：登入頁按「忘記密碼？」，系統會寄重設信到帳號的 Email（所以該帳號的 Email 必須是能收信的真實信箱）。
- 重設信的連結會回到 `/admin/reset-password`，這個網址必須加入 Supabase → Authentication → URL Configuration → **Redirect URLs**：
  `https://chemistry-learning-system.vercel.app/admin/reset-password`

## 部署到 Vercel

1. 到 [vercel.com](https://vercel.com) 用 GitHub 帳號登入，選擇 **Add New → Project**。
2. 選擇這個 GitHub repository（`chemistry-learning-system`）。
3. Framework Preset 選 **Vite**（Vercel 通常會自動偵測）。
4. 在 **Environment Variables** 區塊，新增以下兩個變數（值跟你本機 `.env` 一樣）：
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
5. 按 **Deploy**，等待建置完成即可拿到網址。
