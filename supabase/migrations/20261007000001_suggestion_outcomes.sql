-- History-only migration: suggestion_outcomes table already created in Supabase.
-- Records which horse was picked vs. what the app suggested, for measuring accuracy.

create table if not exists suggestion_outcomes (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  source          text not null check (source in ('assign_all', 'matches', 'swap', 'manual')),
  guest_id        uuid references guests(id) on delete cascade,
  picked_horse    text not null,
  suggested       jsonb,           -- ordered array of suggested horse names, or null
  picked_rank     int,             -- 1-based rank in suggested list; null = not found or no list
  assignment_id   uuid,            -- horse_assignments row (no FK — avoids cascade delete losing data)
  user_id         uuid
);

-- RLS: admins can read and insert (insert policy requires user_id = auth.uid())
alter table suggestion_outcomes enable row level security;

create policy "Admins can read suggestion_outcomes"
  on suggestion_outcomes for select
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

create policy "Admins can insert their own suggestion_outcomes"
  on suggestion_outcomes for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );
