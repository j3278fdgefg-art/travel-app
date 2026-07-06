-- 想買清單：項目照片
-- 在 Supabase Dashboard > SQL Editor 執行此檔案

alter table checklist_items add column if not exists image_url text;

-- 建立公開的照片儲存桶
insert into storage.buckets (id, name, public)
values ('checklist-photos', 'checklist-photos', true)
on conflict (id) do nothing;

create policy "checklist_photos_public_read"
  on storage.objects for select
  using (bucket_id = 'checklist-photos');

create policy "checklist_photos_authenticated_insert"
  on storage.objects for insert
  with check (bucket_id = 'checklist-photos' and auth.role() = 'authenticated');

create policy "checklist_photos_authenticated_delete"
  on storage.objects for delete
  using (bucket_id = 'checklist-photos' and auth.role() = 'authenticated');
