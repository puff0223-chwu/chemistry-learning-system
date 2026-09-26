-- 題庫編輯器升級：題目分類（難度、內容標籤）與網站外觀設定
-- 可重複執行。Storage bucket 無法用 SQL 建立，請另外在 Dashboard 建立（見 storage.sql）。

alter table questions
  add column if not exists difficulty text
    check (difficulty in ('基礎', '進階', '挑戰')),
  add column if not exists content_tag_ids bigint[] default '{}';

create table if not exists tags (
  id bigint generated always as identity primary key,
  name text not null unique,
  created_at timestamptz default now()
);
alter table tags enable row level security;
drop policy if exists "tags_anon_select" on tags;
create policy "tags_anon_select" on tags for select to anon using (true);
drop policy if exists "tags_auth_all" on tags;
create policy "tags_auth_all" on tags for all to authenticated using (true);
grant select on tags to anon;
grant all on tags to authenticated;
grant all on tags to service_role;

create table if not exists settings (
  key text primary key,
  value text not null,
  updated_at timestamptz default now()
);
alter table settings enable row level security;
drop policy if exists "settings_anon_select" on settings;
create policy "settings_anon_select" on settings for select to anon using (true);
drop policy if exists "settings_auth_all" on settings;
create policy "settings_auth_all" on settings for all to authenticated using (true);
grant select on settings to anon;
grant all on settings to authenticated;
grant all on settings to service_role;

insert into settings (key, value) values
  ('theme_preset', 'blue'),
  ('bg_home', '/bg-home.jpg.png'),
  ('bg_task', '/bg-task.jpg.png'),
  ('bg_battle', '/bg-battle.jpg.png')
on conflict (key) do nothing;
