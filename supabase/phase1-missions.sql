-- 第 1 階段：任務系統地基（科學任務偵探所）
-- 請到 Supabase 專案的 SQL Editor 貼上並執行整份檔案一次（可重複執行，不會重複建立、不會動到既有資料）。
-- 前提：已執行過 schema.sql → logs.sql → editor-upgrade.sql → storage.sql。
--
-- 內容：
--   1. 新增 5 張資料表：mission_categories、missions、mission_assets、mission_logs、mission_submissions
--   2. 檢視表 published_missions：學生（anon）只能透過它讀到「已發布且開放中」的任務
--   3. student_sessions 新增 mission_id、mission_version，mode 新增值 'mission'
--   4. RLS 與 GRANT（GRANT 決定能不能碰、RLS 決定能碰哪幾列，兩層都要）
--   5. Storage bucket mission-assets（public 讀取，登入的老師可上傳）

-- ============================================================
-- 1. 任務分類
-- ============================================================
create table if not exists mission_categories (
  id bigint generated always as identity primary key,
  name text not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

insert into mission_categories (name, sort_order) values
  ('化學任務', 1),
  ('鑑識案件', 2),
  ('密室逃脫', 3)
on conflict (name) do nothing;

-- ============================================================
-- 2. 任務本體（草稿與已發布各一份 JSON）
-- ============================================================
create table if not exists missions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  -- 分類被刪除時任務保留，只是變成「未分類」
  category_id bigint references mission_categories(id) on delete set null,
  cover_url text,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  is_open boolean not null default false,
  draft_data jsonb not null default '{}'::jsonb,
  published_data jsonb,
  published_version int not null default 0,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists missions_updated_at_idx on missions (updated_at desc);
create index if not exists missions_category_idx on missions (category_id);

create or replace function set_missions_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists missions_set_updated_at on missions;
create trigger missions_set_updated_at
  before update on missions
  for each row execute function set_missions_updated_at();

-- ============================================================
-- 3. 素材庫紀錄（mission_id 為空 = 共用素材）
-- ============================================================
create table if not exists mission_assets (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid references missions(id) on delete set null,
  storage_path text not null,
  type text not null,
  bytes bigint not null default 0,
  width int,
  height int,
  created_at timestamptz not null default now()
);

create index if not exists mission_assets_mission_idx on mission_assets (mission_id);

-- ============================================================
-- 4. student_sessions 沿用，新增欄位與 mode 值（既有資料不受影響）
-- ============================================================
alter table student_sessions
  add column if not exists mission_id uuid references missions(id) on delete set null,
  add column if not exists mission_version int;

do $$
begin
  alter table student_sessions drop constraint if exists student_sessions_mode_check;
  alter table student_sessions
    add constraint student_sessions_mode_check check (mode in ('task', 'battle', 'mission'));
end $$;

create index if not exists student_sessions_mission_idx on student_sessions (mission_id);

-- ============================================================
-- 5. 遊玩事件紀錄與破關作答
-- ============================================================
create table if not exists mission_logs (
  id bigint generated always as identity primary key,
  session_id uuid not null references student_sessions(session_uuid) on delete cascade,
  mission_id uuid references missions(id) on delete set null,
  mission_version int,
  stage_id text,
  scene_id text,
  block_id text,
  event_type text not null,
  payload jsonb,
  client_ts timestamptz,
  seq int not null,
  created_at timestamptz not null default now(),
  -- 離線重送不會重複：同一場遊玩的同一個序號只收一筆
  unique (session_id, seq)
);

create index if not exists mission_logs_mission_idx on mission_logs (mission_id);

create table if not exists mission_submissions (
  id bigint generated always as identity primary key,
  session_id uuid not null references student_sessions(session_uuid) on delete cascade,
  mission_id uuid references missions(id) on delete set null,
  answers jsonb,
  auto_score numeric,
  suggested_score numeric,
  rubric_hits jsonb,
  teacher_score numeric,
  teacher_comment text,
  total_seconds int,
  hint_count int not null default 0,
  submitted_at timestamptz not null default now()
);

create index if not exists mission_submissions_mission_idx on mission_submissions (mission_id);

-- ============================================================
-- 6. 學生只能透過檢視表讀到已發布版本（看不到草稿）
-- ============================================================
create or replace view published_missions as
  select id, title, category_id, cover_url, published_data, published_version, published_at
  from missions
  where status = 'published' and is_open = true;

-- ============================================================
-- 7. RLS
-- ============================================================
alter table mission_categories enable row level security;
alter table missions enable row level security;
alter table mission_assets enable row level security;
alter table mission_logs enable row level security;
alter table mission_submissions enable row level security;

-- 分類：任何人可讀（學生任務列表要用來篩選），老師可改
drop policy if exists "mission_categories_public_select" on mission_categories;
create policy "mission_categories_public_select" on mission_categories
  for select to anon, authenticated using (true);
drop policy if exists "mission_categories_teacher_write" on mission_categories;
create policy "mission_categories_teacher_write" on mission_categories
  for all to authenticated using (true) with check (true);

-- 任務、素材紀錄：只有老師。學生不直接碰 missions 表（只經過 published_missions 檢視表）
drop policy if exists "missions_teacher_all" on missions;
create policy "missions_teacher_all" on missions
  for all to authenticated using (true) with check (true);
drop policy if exists "mission_assets_teacher_all" on mission_assets;
create policy "mission_assets_teacher_all" on mission_assets
  for all to authenticated using (true) with check (true);
-- 學生端播放素材時需要知道素材網址，素材紀錄不含答案，開放讀取
drop policy if exists "mission_assets_public_select" on mission_assets;
create policy "mission_assets_public_select" on mission_assets
  for select to anon using (true);

-- 遊玩紀錄與作答：學生只能寫入、不能讀取；老師可查詢、修改評分、刪除
-- （老師若在同一瀏覽器登入著後台，請求以 authenticated 送出，所以也允許寫入）
drop policy if exists "mission_logs_insert" on mission_logs;
create policy "mission_logs_insert" on mission_logs
  for insert to anon, authenticated with check (true);
drop policy if exists "mission_logs_teacher_select" on mission_logs;
create policy "mission_logs_teacher_select" on mission_logs
  for select to authenticated using (true);
drop policy if exists "mission_logs_teacher_delete" on mission_logs;
create policy "mission_logs_teacher_delete" on mission_logs
  for delete to authenticated using (true);

drop policy if exists "mission_submissions_insert" on mission_submissions;
create policy "mission_submissions_insert" on mission_submissions
  for insert to anon, authenticated with check (true);
drop policy if exists "mission_submissions_teacher_select" on mission_submissions;
create policy "mission_submissions_teacher_select" on mission_submissions
  for select to authenticated using (true);
drop policy if exists "mission_submissions_teacher_update" on mission_submissions;
create policy "mission_submissions_teacher_update" on mission_submissions
  for update to authenticated using (true) with check (true);
drop policy if exists "mission_submissions_teacher_delete" on mission_submissions;
create policy "mission_submissions_teacher_delete" on mission_submissions
  for delete to authenticated using (true);

-- ============================================================
-- 8. GRANT（用 SQL Editor 建表不會自動授權給各角色）
-- ============================================================
grant select on mission_categories to anon;
grant select, insert, update, delete on mission_categories to authenticated;

-- missions 表學生完全不授權；只開放檢視表
grant select, insert, update, delete on missions to authenticated;
grant select on published_missions to anon, authenticated;

grant select on mission_assets to anon;
grant select, insert, update, delete on mission_assets to authenticated;

grant insert on mission_logs, mission_submissions to anon;
grant insert, select, delete on mission_logs to authenticated;
grant insert, select, update, delete on mission_submissions to authenticated;

grant all on mission_categories, missions, mission_assets, mission_logs, mission_submissions to service_role;
grant select on published_missions to service_role;

-- ============================================================
-- 9. Storage bucket：mission-assets（public 讀取，登入的老師可上傳）
--    若下面這行建立 bucket 失敗，請改到 Dashboard → Storage 手動建立 public bucket「mission-assets」，再執行其餘部分。
-- ============================================================
insert into storage.buckets (id, name, public)
values ('mission-assets', 'mission-assets', true)
on conflict (id) do nothing;

drop policy if exists "teacher_insert_mission_assets" on storage.objects;
create policy "teacher_insert_mission_assets" on storage.objects
  for insert to authenticated with check (bucket_id = 'mission-assets');
drop policy if exists "teacher_select_mission_assets" on storage.objects;
create policy "teacher_select_mission_assets" on storage.objects
  for select to authenticated using (bucket_id = 'mission-assets');
drop policy if exists "teacher_update_mission_assets" on storage.objects;
create policy "teacher_update_mission_assets" on storage.objects
  for update to authenticated using (bucket_id = 'mission-assets');
drop policy if exists "teacher_delete_mission_assets" on storage.objects;
create policy "teacher_delete_mission_assets" on storage.objects
  for delete to authenticated using (bucket_id = 'mission-assets');
