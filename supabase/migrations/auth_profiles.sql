-- profiles table linked to Supabase Auth users
CREATE TABLE IF NOT EXISTS public.profiles (
  id        uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email     text NOT NULL,
  role      text NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'viewer')),
  full_name text
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users can only read their own profile; no client-side writes
CREATE POLICY "users_read_own_profile"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);
