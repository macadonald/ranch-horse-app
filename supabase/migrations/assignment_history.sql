-- Permanent assignment history — never deleted, survives guest removal
CREATE TABLE IF NOT EXISTS assignment_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  guest_name text NOT NULL,
  guest_id uuid,
  horse_name text NOT NULL,
  assignment_type text NOT NULL DEFAULT 'primary',
  assigned_date date NOT NULL,
  match_quality smallint DEFAULT NULL,  -- 1=thumbs up, -1=thumbs down
  doesnt_work boolean DEFAULT false,
  doesnt_work_reason text,
  archived_at timestamptz DEFAULT NULL,
  source text DEFAULT 'manual',  -- 'manual' | 'assign_all' | 'board'
  created_at timestamptz DEFAULT now()
);

ALTER TABLE guests ADD COLUMN IF NOT EXISTS overestimates_level boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_assignment_history_guest_name ON assignment_history(guest_name);
CREATE INDEX IF NOT EXISTS idx_assignment_history_horse_name ON assignment_history(horse_name);
CREATE INDEX IF NOT EXISTS idx_assignment_history_assigned_date ON assignment_history(assigned_date);
CREATE INDEX IF NOT EXISTS idx_assignment_history_guest_id ON assignment_history(guest_id);
