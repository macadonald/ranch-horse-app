-- Weekly digest storage (history only — already run in Supabase)
create table if not exists public.weekly_digests (
  id            uuid        default gen_random_uuid() primary key,
  week_start    date        unique not null,
  content       jsonb       not null,
  generated_by  uuid        references auth.users(id),
  created_at    timestamptz default now()
);

alter table public.weekly_digests enable row level security;

create policy "admins_all" on public.weekly_digests
  for all
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );
