-- Logging tables for Assign All runs and per-guest suggestions.
-- assign_all_suggestions.confirmed tracks whether a suggestion was actually saved;
-- only confirmed rows are meaningful for future analytics.

CREATE TABLE IF NOT EXISTS assign_all_runs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  guest_count integer
);

CREATE TABLE IF NOT EXISTS assign_all_suggestions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          uuid        NOT NULL REFERENCES assign_all_runs(id) ON DELETE CASCADE,
  guest_id        uuid        NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  pass            smallint    NOT NULL,           -- 1 = own horse, 2 = shared, 3 = no suggestion
  suggested_horse text,                           -- null for pass 3
  no_horse_reason text,                           -- e.g. 'triple_cap', 'no_match'
  top_candidates  jsonb       NOT NULL DEFAULT '[]',
  -- up to 5: [{ rank, horse_name, score, components }]
  confirmed       boolean     NOT NULL DEFAULT false,
  confirmed_at    timestamptz,
  final_horse     text,                           -- horse actually confirmed (may differ from suggested_horse)
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assign_all_suggestions_guest_id  ON assign_all_suggestions(guest_id);
CREATE INDEX IF NOT EXISTS idx_assign_all_suggestions_confirmed ON assign_all_suggestions(confirmed);
