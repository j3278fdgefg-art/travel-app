-- ============================================
-- 旅遊小幫手 - Supabase 資料庫結構
-- 在 Supabase Dashboard > SQL Editor 執行此檔案
-- ============================================

-- 啟用 UUID 擴充
create extension if not exists "uuid-ossp";

-- ============================================
-- 旅程表
-- ============================================
create table trips (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  destination text,
  start_date date not null,
  end_date date not null,
  cover_emoji text default '✈️',
  owner_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamptz default now()
);

-- ============================================
-- 成員表
-- ============================================
create table trip_members (
  id uuid default uuid_generate_v4() primary key,
  trip_id uuid references trips(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete set null,
  display_name text not null,
  avatar_emoji text default '😀',
  role text default 'member' check (role in ('owner', 'member')),
  created_at timestamptz default now()
);

-- ============================================
-- 行程日表
-- ============================================
create table itinerary_days (
  id uuid default uuid_generate_v4() primary key,
  trip_id uuid references trips(id) on delete cascade not null,
  date date not null,
  day_number int not null,
  created_at timestamptz default now()
);

-- ============================================
-- 行程項目表
-- ============================================
create table itinerary_items (
  id uuid default uuid_generate_v4() primary key,
  trip_id uuid references trips(id) on delete cascade not null,
  day_id uuid references itinerary_days(id) on delete cascade not null,
  time text not null,
  title text not null,
  location text,
  note text,
  type text default 'other' check (type in ('transport', 'accommodation', 'food', 'attraction', 'other')),
  order_index int default 0,
  created_at timestamptz default now()
);

-- ============================================
-- 預訂表
-- ============================================
create table bookings (
  id uuid default uuid_generate_v4() primary key,
  trip_id uuid references trips(id) on delete cascade not null,
  type text not null check (type in ('flight', 'hotel', 'car', 'voucher')),
  title text not null,
  booking_ref text,
  provider text,
  from_location text,
  to_location text,
  check_in text,
  check_out text,
  departure_time text,
  arrival_time text,
  amount numeric default 0,
  currency text default 'TWD',
  member_names text,
  note text,
  created_at timestamptz default now()
);

-- ============================================
-- 支出表
-- ============================================
create table expenses (
  id uuid default uuid_generate_v4() primary key,
  trip_id uuid references trips(id) on delete cascade not null,
  title text not null,
  amount numeric not null,
  currency text default 'TWD',
  amount_twd numeric,
  paid_by_member_id uuid references trip_members(id) on delete set null,
  paid_by_name text,
  payment_method text default 'card' check (payment_method in ('card', 'cash')),
  date date not null,
  category text default 'other' check (category in ('food', 'transport', 'accommodation', 'shopping', 'activity', 'insurance', 'other')),
  created_at timestamptz default now()
);

-- ============================================
-- 清單表
-- ============================================
create table checklist_items (
  id uuid default uuid_generate_v4() primary key,
  trip_id uuid references trips(id) on delete cascade not null,
  member_id uuid references trip_members(id) on delete set null,
  member_name text,
  type text not null check (type in ('todo', 'packing', 'shopping')),
  content text not null,
  is_done boolean default false,
  created_at timestamptz default now()
);

-- ============================================
-- Row Level Security (RLS) 權限設定
-- ============================================

alter table trips enable row level security;
alter table trip_members enable row level security;
alter table itinerary_days enable row level security;
alter table itinerary_items enable row level security;
alter table bookings enable row level security;
alter table expenses enable row level security;
alter table checklist_items enable row level security;

-- 旅程：只有 owner 可以讀寫（之後可加成員共享）
create policy "trips_owner" on trips
  for all using (auth.uid() = owner_id);

-- 其他表：只要是該旅程的 owner 就可以讀寫
create policy "trip_members_access" on trip_members
  for all using (
    exists (select 1 from trips where id = trip_id and owner_id = auth.uid())
  );

create policy "itinerary_days_access" on itinerary_days
  for all using (
    exists (select 1 from trips where id = trip_id and owner_id = auth.uid())
  );

create policy "itinerary_items_access" on itinerary_items
  for all using (
    exists (select 1 from trips where id = trip_id and owner_id = auth.uid())
  );

create policy "bookings_access" on bookings
  for all using (
    exists (select 1 from trips where id = trip_id and owner_id = auth.uid())
  );

create policy "expenses_access" on expenses
  for all using (
    exists (select 1 from trips where id = trip_id and owner_id = auth.uid())
  );

create policy "checklist_access" on checklist_items
  for all using (
    exists (select 1 from trips where id = trip_id and owner_id = auth.uid())
  );

-- ============================================
-- 自動建立行程天數的 Function
-- 建立旅程後呼叫此 function 自動產生每天的 Day 記錄
-- ============================================
create or replace function create_itinerary_days(p_trip_id uuid)
returns void as $$
declare
  v_trip trips%rowtype;
  v_date date;
  v_day int := 1;
begin
  select * into v_trip from trips where id = p_trip_id;
  v_date := v_trip.start_date;
  while v_date <= v_trip.end_date loop
    insert into itinerary_days (trip_id, date, day_number)
    values (p_trip_id, v_date, v_day);
    v_date := v_date + interval '1 day';
    v_day := v_day + 1;
  end loop;
end;
$$ language plpgsql security definer;
