-- Temporary horse status flags (lame, injured, day_off, in_training, retired).
-- Shoe needs use shoe_needs table. Health issues use horse_health_issues.
-- day_off auto-resets via day_off_date comparison at read time (no cron needed).
create table if not exists horse_status_flags (
  id           uuid        primary key default gen_random_uuid(),
  horse_name   text        not null,
  flag_type    text        not null
               check (flag_type in ('lame','injured','day_off','in_training','retired')),
  notes        text,
  flagged_at   timestamptz not null default now(),
  day_off_date text,   -- Tucson YYYY-MM-DD; only set for day_off type
  status       text        not null default 'active'
               check (status in ('active','resolved'))
);

create index if not exists horse_status_flags_horse_idx  on horse_status_flags(horse_name);
create index if not exists horse_status_flags_status_idx on horse_status_flags(status);
create index if not exists horse_status_flags_type_idx   on horse_status_flags(flag_type);
