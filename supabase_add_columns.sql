-- 在 Supabase Dashboard > SQL Editor 執行此檔案
-- 新增 expenses 的共同消費人欄位
alter table expenses add column if not exists shared_with jsonb default '[]'::jsonb;
alter table expenses add column if not exists note text;

-- 新增 trip_members 的 LINE / IG / email 欄位
alter table trip_members add column if not exists email text;
alter table trip_members add column if not exists line_id text;
alter table trip_members add column if not exists ig_handle text;

-- 新增 trips 的邀請連結欄位
alter table trips add column if not exists single_use_token text;
alter table trips add column if not exists invite_expires_at timestamptz;
alter table trips add column if not exists permanent_invite_token text;
