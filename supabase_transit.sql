-- 行程項目之間的交通資訊（存在「後一個項目」上，代表從上一個點到這個點）
-- 在 Supabase → SQL Editor 貼上執行一次即可。
alter table itinerary_items add column if not exists transit_mode text;
alter table itinerary_items add column if not exists transit_min integer;
