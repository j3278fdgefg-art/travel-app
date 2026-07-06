-- 在 Supabase Dashboard > SQL Editor 執行
-- 修正：新增 'rental' 到 bookings type 的 check constraint

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_type_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_type_check
  CHECK (type IN ('flight', 'hotel', 'car', 'voucher', 'rental'));
