-- 學生使用紀錄（logs）資料表
-- 請至 Supabase 專案的 SQL Editor 貼上並執行整份檔案一次即可（可重複執行，不會重複建立）。

create table if not exists student_sessions (
  id bigint generated always as identity primary key,
  session_uuid uuid not null default gen_random_uuid() unique,
  mode text not null check (mode in ('task', 'battle')),
  purpose text not null check (purpose in ('進度學習', '考試複習', '重補修')),
  grade text not null check (grade in ('國中', '高一', '高二', '高三')),
  class_name text not null,
  seat_number text not null,
  student_name text not null,
  -- 主題被刪除時保留紀錄（topic_name 保留當時的名稱）
  topic_id bigint references topics(id) on delete set null,
  topic_name text,
  player_role text check (player_role in ('A', 'B')),
  battle_session_uuid uuid,
  started_at timestamptz not null default now()
);

create table if not exists task_logs (
  id bigint generated always as identity primary key,
  session_uuid uuid not null references student_sessions(session_uuid) on delete cascade,
  -- 題目被刪除時保留紀錄
  question_id bigint references questions(id) on delete set null,
  question_order int,
  -- answer_correct / answer_wrong / hint_1_shown / hint_2_shown / hint_3_shown
  -- help_requested / question_skipped / topic_complete
  event_type text not null,
  answer_given text,
  is_correct boolean,
  time_spent_seconds int,
  hint_count int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists battle_logs (
  id bigint generated always as identity primary key,
  battle_session_uuid uuid not null,
  question_id bigint references questions(id) on delete set null,
  question_order int,
  player_a_session_uuid uuid references student_sessions(session_uuid) on delete cascade,
  player_b_session_uuid uuid references student_sessions(session_uuid) on delete cascade,
  player_a_answer text,
  player_b_answer text,
  player_a_correct boolean,
  player_b_correct boolean,
  player_a_time_seconds int,
  player_b_time_seconds int,
  player_a_hp_after int,
  player_b_hp_after int,
  winner text check (winner in ('A', 'B', 'draw', 'both_wrong', 'timeout')),
  created_at timestamptz not null default now()
);

create index if not exists student_sessions_started_at_idx on student_sessions (started_at desc);
create index if not exists student_sessions_battle_uuid_idx on student_sessions (battle_session_uuid);
create index if not exists task_logs_session_idx on task_logs (session_uuid);
create index if not exists battle_logs_battle_uuid_idx on battle_logs (battle_session_uuid);

alter table student_sessions enable row level security;
alter table task_logs enable row level security;
alter table battle_logs enable row level security;

-- 學生（anon）只能寫入、不能讀取。
-- 老師若在同一個瀏覽器登入著後台，請求會以 authenticated 身分送出，所以也需要允許寫入。
drop policy if exists "student_sessions_insert" on student_sessions;
create policy "student_sessions_insert" on student_sessions
  for insert to anon, authenticated with check (true);
drop policy if exists "task_logs_insert" on task_logs;
create policy "task_logs_insert" on task_logs
  for insert to anon, authenticated with check (true);
drop policy if exists "battle_logs_insert" on battle_logs;
create policy "battle_logs_insert" on battle_logs
  for insert to anon, authenticated with check (true);

-- 老師（authenticated）可以查詢與刪除
drop policy if exists "student_sessions_teacher_select" on student_sessions;
create policy "student_sessions_teacher_select" on student_sessions
  for select to authenticated using (true);
drop policy if exists "student_sessions_teacher_delete" on student_sessions;
create policy "student_sessions_teacher_delete" on student_sessions
  for delete to authenticated using (true);

drop policy if exists "task_logs_teacher_select" on task_logs;
create policy "task_logs_teacher_select" on task_logs
  for select to authenticated using (true);
drop policy if exists "task_logs_teacher_delete" on task_logs;
create policy "task_logs_teacher_delete" on task_logs
  for delete to authenticated using (true);

drop policy if exists "battle_logs_teacher_select" on battle_logs;
create policy "battle_logs_teacher_select" on battle_logs
  for select to authenticated using (true);
drop policy if exists "battle_logs_teacher_delete" on battle_logs;
create policy "battle_logs_teacher_delete" on battle_logs
  for delete to authenticated using (true);

-- 用 SQL Editor 建表不會自動授權給各角色，需要另外 GRANT（與先前 topics / questions 相同）
grant insert on student_sessions, task_logs, battle_logs to anon;
grant insert, select, delete on student_sessions, task_logs, battle_logs to authenticated;
grant all on student_sessions, task_logs, battle_logs to service_role;
