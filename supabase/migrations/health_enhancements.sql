-- Update location check constraint to include new values
alter table horse_health_issues
  drop constraint if exists horse_health_issues_location_check;

alter table horse_health_issues
  add constraint horse_health_issues_location_check check (location in (
    'left_front_hoof', 'right_front_hoof', 'left_rear_hoof', 'right_rear_hoof',
    'all_4_hooves', 'front_hooves', 'rear_hooves',
    'left_front_leg', 'right_front_leg', 'left_rear_leg', 'right_rear_leg',
    'front_legs', 'rear_legs',
    'back', 'cinch', 'wither', 'neck', 'chest', 'flank', 'face', 'na',
    'left_eye', 'right_eye'
  ));

-- Update type check constraint to include new values
alter table horse_health_issues
  drop constraint if exists horse_health_issues_type_check;

alter table horse_health_issues
  add constraint horse_health_issues_type_check check (type in (
    'wound', 'abscess', 'eye', 'skin', 'hoof', 'sore', 'cut', 'sunscreen', 'meds', 'other'
  ));

-- Grain / supplement tracking table
create table if not exists horse_supplements (
  id              uuid        default gen_random_uuid() primary key,
  horse_name      text        not null,
  supplement_name text        not null,
  frequency       text        not null default 'once_daily'
                              check (frequency in ('once_daily', 'twice_daily', 'as_needed')),
  notes           text,
  done_today      boolean     not null default false,
  done_today_date text,
  created_at      timestamptz not null default now()
);

create index on horse_supplements (horse_name);
