-- History-only: already applied to production Supabase.

CREATE TABLE IF NOT EXISTS farriers (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        UNIQUE NOT NULL,
  active     boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO farriers (name, active) VALUES
  ('Cody',         true),
  ('Faris',        true),
  ('Russell True', true),
  ('Cisco',        false)
ON CONFLICT (name) DO NOTHING;

-- NULL means "Shared" (any farrier). Free-text, no FK.
ALTER TABLE horses ADD COLUMN IF NOT EXISTS farrier text;
