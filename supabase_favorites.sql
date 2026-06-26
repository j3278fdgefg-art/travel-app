-- 收藏清單（每個行程一份，成員共用）
-- 在 Supabase → SQL Editor 貼上執行一次即可。
create table if not exists favorites (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  name text not null,
  address text,
  lat double precision,
  lng double precision,
  place_id text,
  note text,
  created_at timestamptz default now()
);

create index if not exists favorites_trip_id_idx on favorites (trip_id);
