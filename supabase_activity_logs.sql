-- ============================================
-- 編輯紀錄表 (activity_logs)
-- 在 Supabase Dashboard > SQL Editor 執行此檔案
-- ============================================

create table if not exists activity_logs (
  id uuid default uuid_generate_v4() primary key,
  trip_id uuid references trips(id) on delete cascade not null,
  member_name text not null,
  action text not null,
  detail text default '',
  created_at timestamptz default now()
);

-- 讓所有旅程成員都可以 insert（記錄自己的操作）
alter table activity_logs enable row level security;

create policy "trip members can insert logs"
  on activity_logs for insert
  with check (
    exists (
      select 1 from trips where trips.id = activity_logs.trip_id
      and (
        trips.owner_id = auth.uid()
        or exists (
          select 1 from trip_members
          where trip_members.trip_id = activity_logs.trip_id
          and trip_members.user_id = auth.uid()
        )
      )
    )
  );

-- 只有旅程主辦人可以讀取
create policy "only owner can read logs"
  on activity_logs for select
  using (
    exists (
      select 1 from trips
      where trips.id = activity_logs.trip_id
      and trips.owner_id = auth.uid()
    )
  );
