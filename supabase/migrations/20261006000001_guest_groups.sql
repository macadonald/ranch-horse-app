-- Guest groups and related guests columns (already run in Supabase — history only)

-- create table public.guest_groups (
--   id         uuid        default gen_random_uuid() primary key,
--   name       text        not null,
--   notes      text,
--   created_at timestamptz default now(),
--   constraint guest_groups_name_key unique (name)
-- );
-- alter table public.guest_groups enable row level security;
-- create policy "logged_in_read" on public.guest_groups
--   for select using (auth.uid() is not null);
-- create policy "admins_write" on public.guest_groups
--   for all using (
--     exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
--   );

-- alter table public.guests
--   add column if not exists group_id uuid references public.guest_groups(id) on delete set null,
--   add column if not exists repeat_guest_notes text;
