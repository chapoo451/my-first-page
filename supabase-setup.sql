-- Supabase SQL Editor で実行してください

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS guests INTEGER;

UPDATE reservations
SET guests = 1
WHERE guests IS NULL;

ALTER TABLE reservations
  ALTER COLUMN guests SET NOT NULL;

ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon select reservations" ON reservations;
DROP POLICY IF EXISTS "Allow anon insert reservations" ON reservations;
DROP POLICY IF EXISTS "Allow anon delete reservations" ON reservations;

CREATE POLICY "Allow anon select reservations"
  ON reservations FOR SELECT TO anon USING (true);

CREATE POLICY "Allow anon insert reservations"
  ON reservations FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow anon delete reservations"
  ON reservations FOR DELETE TO anon USING (true);

-- 時間帯マスタ
CREATE TABLE IF NOT EXISTS time_slots (
  id BIGSERIAL PRIMARY KEY,
  time TEXT NOT NULL UNIQUE,
  capacity INTEGER NOT NULL CHECK (capacity > 0)
);

INSERT INTO time_slots (time, capacity) VALUES
  ('10:00', 4),
  ('11:00', 4),
  ('12:00', 4),
  ('13:00', 4),
  ('14:00', 4),
  ('15:00', 4),
  ('16:00', 4),
  ('17:00', 4),
  ('18:00', 4)
ON CONFLICT (time) DO NOTHING;

ALTER TABLE time_slots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon select time_slots" ON time_slots;
CREATE POLICY "Allow anon select time_slots"
  ON time_slots FOR SELECT TO anon USING (true);
