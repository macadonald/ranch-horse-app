-- Swap-flow columns on horse_assignments.
-- Already applied directly to the live database — recorded here for history only.

ALTER TABLE horse_assignments
  ADD COLUMN IF NOT EXISTS swap_category text
    CHECK (swap_category IN ('guest_request', 'horse_issue', 'staff')),
  ADD COLUMN IF NOT EXISTS swap_reason text,
  ADD COLUMN IF NOT EXISTS removed_at timestamptz;
