-- Add FK from horse_assignments.guest_id → guests(id) with cascade delete.
-- assignment_history.guest_id intentionally has no FK: that table is permanent
-- history designed to survive guest removal (see assignment_history.sql comment).
ALTER TABLE horse_assignments
  ADD CONSTRAINT fk_horse_assignments_guest_id
  FOREIGN KEY (guest_id) REFERENCES guests(id) ON DELETE CASCADE;
