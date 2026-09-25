# 化學學習系統

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
| `VITE_ADMIN_EMAIL` | 老師後台登入用的 Supabase Auth 帳號（內部使用，不會顯示給老師看） |
| `VITE_ADMIN_PASSWORD` | 老師後台登入密碼，同時也是上面帳號在 Supabase Auth 的密碼 |

> 注意：`.env` 已加入 `.gitignore`，不會被推上 GitHub。

## 資料庫設定（Supabase）

1. 到 Supabase 專案的 **SQL Editor**，貼上並執行 [`supabase/schema.sql`](supabase/schema.sql)，建立 `topics`、`questions` 兩張表與 RLS policies。
2. 到 **Authentication → Users**，確認已建立老師登入帳號（Email 對應 `VITE_ADMIN_EMAIL`，密碼對應 `VITE_ADMIN_PASSWORD`）。
3. （可選）執行 [`supabase/seed.sql`](supabase/seed.sql) 插入示範資料，或直接透過老師後台新增。

### 為什麼老師後台用 Supabase Auth 登入，而不是規格書寫的「純前端密碼比對＋secret key」？

這是一個純前端（Vite 靜態網站）專案，沒有後端伺服器。如果照原規格把 Supabase 的 **secret key**（等同 service role，能繞過所有 RLS、讀寫整個資料庫）放進 `VITE_` 開頭的環境變數，它就會被打包進瀏覽器可以看到的 JS 檔案裡，任何人打開瀏覽器開發者工具都能拿到這把 key，等於整個資料庫（不只 topics/questions 兩張表）都會被任何訪客完全開放讀寫。

為了避免這個風險，老師後台改用 Supabase Auth 的帳號密碼登入：老師看到的畫面一樣只有「輸入密碼」，但背後會用一組固定 email（`VITE_ADMIN_EMAIL`）+ 密碼向 Supabase 登入，取得真正的 `authenticated`身份，這樣 RLS 政策才能正確地「只有登入者能寫入」。Secret key 只在建立這個登入帳號時使用一次，不會出現在任何程式碼或 `.env` 裡。

若之後要更改老師密碼，需要同時：
1. 修改 `.env`（或 Vercel 環境變數）裡的 `VITE_ADMIN_PASSWORD`
2. 到 Supabase Dashboard → Authentication → Users，將該帳號的密碼改成一樣的值

## 部署到 Vercel

1. 到 [vercel.com](https://vercel.com) 用 GitHub 帳號登入，選擇 **Add New → Project**。
2. 選擇這個 GitHub repository（`chemistry-learning-system`）。
3. Framework Preset 選 **Vite**（Vercel 通常會自動偵測）。
4. 在 **Environment Variables** 區塊，新增以下四個變數（值跟你本機 `.env` 一樣）：
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `VITE_ADMIN_EMAIL`
   - `VITE_ADMIN_PASSWORD`
5. 按 **Deploy**，等待建置完成即可拿到網址。
