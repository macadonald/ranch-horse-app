ALTER TABLE guests ADD COLUMN IF NOT EXISTS repeat_guest boolean DEFAULT false;
ALTER TABLE guests ADD COLUMN IF NOT EXISTS repeat_guest_notes text;
