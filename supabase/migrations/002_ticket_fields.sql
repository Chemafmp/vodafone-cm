-- Add closure and relation fields to tickets
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS closure_code       text,
  ADD COLUMN IF NOT EXISTS resolution_summary text,
  ADD COLUMN IF NOT EXISTS related_change_id  text;
