-- Storage 權限：讓登入的老師可以上傳題目圖片與網站背景圖
-- （bucket 設為 public 只代表「任何人都能讀取圖片網址」，上傳仍需要下面的 policy）
-- 請先在 Supabase Dashboard → Storage 建立兩個 public bucket：question-images、site-backgrounds，
-- 再到 SQL Editor 執行這份檔案（可重複執行）。

drop policy if exists "teacher_insert_site_images" on storage.objects;
create policy "teacher_insert_site_images" on storage.objects
  for insert to authenticated
  with check (bucket_id in ('question-images', 'site-backgrounds'));

drop policy if exists "teacher_select_site_images" on storage.objects;
create policy "teacher_select_site_images" on storage.objects
  for select to authenticated
  using (bucket_id in ('question-images', 'site-backgrounds'));

-- 更換背景圖時會順手刪除舊的自訂圖片
drop policy if exists "teacher_delete_site_images" on storage.objects;
create policy "teacher_delete_site_images" on storage.objects
  for delete to authenticated
  using (bucket_id in ('question-images', 'site-backgrounds'));
