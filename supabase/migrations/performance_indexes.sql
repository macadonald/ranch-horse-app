-- Performance indexes for horse-stats and assignment-history queries.
-- horse_assignments has no horse_id column; the horse identifier is horse_name.

-- Speeds up the WHERE incompatible = false filter in /api/horse-stats
CREATE INDEX IF NOT EXISTS idx_horse_assignments_incompatible
  ON horse_assignments (incompatible);

-- Speeds up the guest_id join between horse_assignments and guests
CREATE INDEX IF NOT EXISTS idx_horse_assignments_guest_id
  ON horse_assignments (guest_id);

-- Speeds up per-horse grouping and name-based lookups
CREATE INDEX IF NOT EXISTS idx_horse_assignments_horse_name
  ON horse_assignments (horse_name);

-- Speeds up assignment-history since-date range filter (assigned_at >= cutoff)
CREATE INDEX IF NOT EXISTS idx_horse_assignments_assigned_at
  ON horse_assignments (assigned_at);

-- Speeds up future queries filtered or sorted by guest weight or age
CREATE INDEX IF NOT EXISTS idx_guests_weight
  ON guests (weight);

CREATE INDEX IF NOT EXISTS idx_guests_age
  ON guests (age);

-- Speeds up the check_in_date range filter used by assignment-history ?since= queries
CREATE INDEX IF NOT EXISTS idx_guests_check_in_date
  ON guests (check_in_date);
