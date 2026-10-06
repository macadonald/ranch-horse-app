-- Pattern explanations cache (AI-generated, keyed by finding + facts hash)
create table if not exists pattern_explanations (
  id          uuid primary key default gen_random_uuid(),
  finding_id  text not null,
  facts_hash  text not null,
  explanation jsonb not null,
  created_at  timestamptz not null default now(),
  unique (finding_id, facts_hash)
);

alter table pattern_explanations enable row level security;

create policy "Logged-in users can read pattern explanations"
  on pattern_explanations for select
  using (auth.role() = 'authenticated');

create policy "Logged-in users can insert pattern explanations"
  on pattern_explanations for insert
  with check (auth.role() = 'authenticated');

-- Pattern feedback (admin thumbs up/down)
create table if not exists pattern_feedback (
  id          uuid primary key default gen_random_uuid(),
  finding_id  text not null,
  facts_hash  text not null,
  vote        text not null check (vote in ('up', 'down')),
  user_id     uuid not null references auth.users(id),
  created_at  timestamptz not null default now()
);

alter table pattern_feedback enable row level security;

create policy "Logged-in users can read pattern feedback"
  on pattern_feedback for select
  using (auth.role() = 'authenticated');

create policy "Admins can insert own pattern feedback"
  on pattern_feedback for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from profiles where id = auth.uid() and role = 'admin'
    )
  );

create policy "Admins can delete pattern feedback"
  on pattern_feedback for delete
  using (
    exists (
      select 1 from profiles where id = auth.uid() and role = 'admin'
    )
  );
