-- History-only: already applied in Supabase production.
-- Adds email column to profiles, kept in sync with auth.users.

-- Add email column
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;

-- Fill email for existing rows from auth.users
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id AND p.email IS NULL;

-- Trigger: fill email on new profile insert
CREATE OR REPLACE FUNCTION public.fill_profile_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  SELECT email INTO NEW.email FROM auth.users WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fill_profile_email ON public.profiles;
CREATE TRIGGER trg_fill_profile_email
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.fill_profile_email();

-- Trigger: sync email when auth.users.email changes
CREATE OR REPLACE FUNCTION public.sync_profile_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.profiles SET email = NEW.email WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_profile_email ON auth.users;
CREATE TRIGGER trg_sync_profile_email
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_email();

-- RLS: admins can SELECT all profiles
DROP POLICY IF EXISTS admin_read_all_profiles ON public.profiles;
CREATE POLICY admin_read_all_profiles ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_admin());
