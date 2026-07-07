-- ============================================
-- RLS 加固：非主辦人/非成員不能直接讀寫旅程資料
-- 在 Supabase Dashboard > SQL Editor 貼上執行一次即可
-- ============================================

-- 共用函式：目前登入的人是不是這個旅程的主辦人或已加入的成員
create or replace function is_trip_member(p_trip_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from trips where id = p_trip_id and owner_id = auth.uid()
  ) or exists (
    select 1 from trip_members where trip_id = p_trip_id and user_id = auth.uid()
  );
$$;

-- 共用函式：這個旅程目前是不是「有邀請連結生效中」（一次性連結未過期，或永久連結存在）
create or replace function has_active_invite(p_trip_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from trips
    where id = p_trip_id
      and (
        permanent_invite_token is not null
        or (single_use_token is not null and (invite_expires_at is null or invite_expires_at > now()))
      )
  );
$$;

-- trips：主辦人/成員可完整讀寫；其他人只有在「目前有邀請連結生效中」時，
-- 才能讀到基本資料（給還沒加入的人看邀請確認畫面用），沒有生效中的邀請就完全看不到
drop policy if exists "trips_owner" on trips;
drop policy if exists "trips_member_rw" on trips;
create policy "trips_member_rw" on trips
  for all using (is_trip_member(id))
  with check (is_trip_member(id));

drop policy if exists "trips_invite_preview" on trips;
create policy "trips_invite_preview" on trips
  for select using (has_active_invite(id));

-- trip_members：主辦人/成員可完整讀寫；
-- 邀請生效期間，登入的使用者可以「新增自己」或「認領一筆還沒綁定帳號的成員」來完成加入
drop policy if exists "trip_members_access" on trip_members;
drop policy if exists "trip_members_rw" on trip_members;
create policy "trip_members_rw" on trip_members
  for all using (is_trip_member(trip_id))
  with check (is_trip_member(trip_id));

drop policy if exists "trip_members_join_insert" on trip_members;
create policy "trip_members_join_insert" on trip_members
  for insert with check (
    user_id = auth.uid() and has_active_invite(trip_id)
  );

drop policy if exists "trip_members_join_claim" on trip_members;
create policy "trip_members_join_claim" on trip_members
  for update using (
    user_id is null and has_active_invite(trip_id)
  ) with check (
    user_id = auth.uid()
  );

-- 其他旅程相關資料表：只有主辦人/成員能讀寫
drop policy if exists "itinerary_days_access" on itinerary_days;
drop policy if exists "itinerary_days_member_rw" on itinerary_days;
create policy "itinerary_days_member_rw" on itinerary_days
  for all using (is_trip_member(trip_id)) with check (is_trip_member(trip_id));

drop policy if exists "itinerary_items_access" on itinerary_items;
drop policy if exists "itinerary_items_member_rw" on itinerary_items;
create policy "itinerary_items_member_rw" on itinerary_items
  for all using (is_trip_member(trip_id)) with check (is_trip_member(trip_id));

drop policy if exists "bookings_access" on bookings;
drop policy if exists "bookings_member_rw" on bookings;
create policy "bookings_member_rw" on bookings
  for all using (is_trip_member(trip_id)) with check (is_trip_member(trip_id));

drop policy if exists "expenses_access" on expenses;
drop policy if exists "expenses_member_rw" on expenses;
create policy "expenses_member_rw" on expenses
  for all using (is_trip_member(trip_id)) with check (is_trip_member(trip_id));

drop policy if exists "checklist_access" on checklist_items;
drop policy if exists "checklist_member_rw" on checklist_items;
create policy "checklist_member_rw" on checklist_items
  for all using (is_trip_member(trip_id)) with check (is_trip_member(trip_id));

alter table favorites enable row level security;
drop policy if exists "favorites_member_rw" on favorites;
create policy "favorites_member_rw" on favorites
  for all using (is_trip_member(trip_id)) with check (is_trip_member(trip_id));

-- activity_logs（編輯紀錄）：沿用原本「只有主辦人能讀」的設計，不放寬，維持原本 policy 不動
