ALTER TABLE guests ADD COLUMN IF NOT EXISTS repeat_guest boolean DEFAULT false;
ALTER TABLE guests ADD COLUMN IF NOT EXISTS checked_out boolean DEFAULT false;
ALTER TABLE guests ADD COLUMN IF NOT EXISTS checked_out_at timestamptz;
