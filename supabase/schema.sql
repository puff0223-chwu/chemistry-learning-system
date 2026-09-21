-- 化學學習系統 資料庫結構
-- 請至 Supabase 專案的 SQL Editor 貼上並執行整份檔案一次即可。

create table if not exists topics (
  id bigint generated always as identity primary key,
  name text not null,
  description text,
  story_context text,
  character_intro text,
  created_at timestamptz default now()
);

create table if not exists questions (
  id bigint generated always as identity primary key,
  topic_id bigint references topics(id) on delete cascade,
  mode text not null check (mode in ('task', 'pk', 'both')),
  type text not null check (type in ('choice', 'fill')),
  content text not null,
  option_a text,
  option_b text,
  option_c text,
  option_d text,
  answer text not null,
  hint_1 text,
  hint_2 text,
  hint_3 text,
  explanation text,
  created_at timestamptz default now()
);

alter table topics enable row level security;
alter table questions enable row level security;

-- 所有人（含未登入訪客）可以讀取主題與題目
create policy "topics_public_select" on topics
  for select using (true);

create policy "questions_public_select" on questions
  for select using (true);

-- 只有登入的老師帳號（authenticated）可以新增／修改／刪除
create policy "topics_authenticated_insert" on topics
  for insert to authenticated with check (true);
create policy "topics_authenticated_update" on topics
  for update to authenticated using (true) with check (true);
create policy "topics_authenticated_delete" on topics
  for delete to authenticated using (true);

create policy "questions_authenticated_insert" on questions
  for insert to authenticated with check (true);
create policy "questions_authenticated_update" on questions
  for update to authenticated using (true) with check (true);
create policy "questions_authenticated_delete" on questions
  for delete to authenticated using (true);

-- 若透過 SQL Editor 直接建表，需另外授權角色基本讀寫權限（Table Editor 網頁介面會自動做這件事，SQL Editor 不會）
grant usage on schema public to anon, authenticated;

grant select on public.topics to anon, authenticated;
grant select on public.questions to anon, authenticated;

grant insert, update, delete on public.topics to authenticated;
grant insert, update, delete on public.questions to authenticated;

-- service_role（後端/腳本用的最高權限角色）也需要明確授權，才能繞過 RLS 直接讀寫
grant all on public.topics to service_role;
grant all on public.questions to service_role;
