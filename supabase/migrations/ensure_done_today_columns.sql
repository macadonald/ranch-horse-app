-- Ensure done_today columns exist (safe to run multiple times)
alter table horse_health_issues
  add column if not exists done_today      boolean not null default false,
  add column if not exists done_today_date text;
