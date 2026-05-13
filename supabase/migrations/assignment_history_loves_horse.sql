ALTER TABLE assignment_history ADD COLUMN IF NOT EXISTS loves_horse boolean DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_assignment_history_loves ON assignment_history(loves_horse) WHERE loves_horse = true;
