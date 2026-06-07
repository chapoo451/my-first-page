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
