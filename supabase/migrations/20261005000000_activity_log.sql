-- Activity log table — records who did what and when.
-- Already applied to the live database; this file is history only.

CREATE TABLE IF NOT EXISTS activity_log (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at  timestamptz DEFAULT now() NOT NULL,
  user_id     uuid        REFERENCES auth.users(id),
  user_email  text,
  action      text        NOT NULL,
  entity_type text,
  entity_id   text,
  summary     text        NOT NULL,
  details     jsonb       DEFAULT '{}'::jsonb
);

ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- Authenticated users may only insert rows for themselves
CREATE POLICY "users can insert own rows"
  ON activity_log FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Only admins may read the log
CREATE POLICY "admins can select"
  ON activity_log FOR SELECT TO authenticated
  USING (public.is_admin());
