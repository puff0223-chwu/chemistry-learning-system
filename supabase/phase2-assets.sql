-- 第 2 階段：素材庫
-- 請到 Supabase 專案的 SQL Editor 貼上並執行整份檔案一次（可重複執行，不會動到既有資料）。
-- 前提：已執行過 phase1-missions.sql。
--
-- 內容：
--   1. mission_assets 新增 name 欄位（顯示用的原始檔名）
--   2. storage_path 唯一：同一份內容（檔名含內容雜湊）不會重複上傳
--   3. 函式 mission_assets_in_use：查出哪些素材正被任務（草稿或已發布）使用，供「刪除保護」使用

alter table mission_assets add column if not exists name text not null default '';

create unique index if not exists mission_assets_storage_path_key on mission_assets (storage_path);

-- 傳入素材 id 清單，回傳其中「被任務引用」的 id。
-- 判斷方式：任務 JSON（草稿或已發布）或封面網址中出現該素材的 id／路徑。
-- p_exclude_mission：計算時略過某個任務（刪除該任務時，用來判斷素材是否還被「其他」任務使用）。
create or replace function mission_assets_in_use(p_ids uuid[], p_exclude_mission uuid default null)
returns setof uuid
language sql
stable
security invoker
as $$
  select a.id
  from mission_assets a
  where a.id = any(p_ids)
    and exists (
      select 1
      from missions m
      where (p_exclude_mission is null or m.id <> p_exclude_mission)
        and (
          m.draft_data::text like '%' || a.id::text || '%'
          or coalesce(m.published_data::text, '') like '%' || a.id::text || '%'
          or coalesce(m.cover_url, '') like '%' || a.storage_path
        )
    );
$$;

revoke all on function mission_assets_in_use(uuid[], uuid) from public, anon;
grant execute on function mission_assets_in_use(uuid[], uuid) to authenticated, service_role;
