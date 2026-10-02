-- Add resolved_at column to horse_status_flags (tracks when a flag was resolved)
ALTER TABLE horse_status_flags
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

-- Extend flag_type CHECK to allow stiff_sore (in addition to existing types)
ALTER TABLE horse_status_flags
  DROP CONSTRAINT IF EXISTS horse_status_flags_flag_type_check;

ALTER TABLE horse_status_flags
  ADD CONSTRAINT horse_status_flags_flag_type_check
    CHECK (flag_type IN ('lame', 'injured', 'day_off', 'in_training', 'retired', 'stiff_sore'));
