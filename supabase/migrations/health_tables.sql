-- Run this in the Supabase SQL editor
-- Note: horses are stored as horse_name (text) throughout this app — no horses table exists.

create table if not exists horse_health_issues (
  id               uuid primary key default gen_random_uuid(),
  horse_name       text not null,
  type             text not null check (type in ('wound', 'abscess', 'eye', 'skin', 'hoof', 'sore', 'other')),
  location         text not null check (location in (
    'left_front_hoof', 'right_front_hoof', 'left_rear_hoof', 'right_rear_hoof',
    'left_front_leg', 'right_front_leg', 'left_rear_leg', 'right_rear_leg',
    'back', 'cinch', 'wither', 'neck', 'chest', 'face', 'eyes'
  )),
  severity         text not null check (severity in ('monitoring', 'needs_treatment', 'vet_required')),
  frequency        text not null check (frequency in ('once_daily', 'twice_daily', 'pre_saddle', 'as_needed')),
  treatment_notes  text,
  notes            text,
  status           text not null default 'active' check (status in ('active', 'resolved')),
  opened_at        timestamptz not null default now(),
  resolved_at      timestamptz,
  last_treated_at  timestamptz,
  -- done_today is derived at read time from done_today_date vs the current Tucson date.
  -- Storing done_today_date (Tucson YYYY-MM-DD) avoids needing a scheduled reset job.
  done_today       boolean not null default false,
  done_today_date  text
);

create index if not exists horse_health_issues_horse_name_idx on horse_health_issues(horse_name);
create index if not exists horse_health_issues_status_idx on horse_health_issues(status);
create index if not exists horse_health_issues_severity_idx on horse_health_issues(severity);
