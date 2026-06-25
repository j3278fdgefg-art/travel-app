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

-- 預訂：追蹤新增者與可見成員
alter table bookings add column if not exists created_by_user_id uuid;
alter table bookings add column if not exists created_by_name text;
alter table bookings add column if not exists visible_to_members text;

-- 新增 itinerary_items 的 location_url 欄位
alter table itinerary_items add column if not exists location_url text;

