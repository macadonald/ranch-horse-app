create table if not exists horse_lame_flags (
  id          uuid        default gen_random_uuid() primary key,
  horse_name  text        not null,
  flag_type   text        not null check (flag_type in ('lame', 'stiff_sore')),
  notes       text,
  flagged_at  timestamptz not null default now(),
  resolved_at timestamptz,
  status      text        not null default 'active' check (status in ('active', 'resolved'))
);

create index on horse_lame_flags (horse_name);
create index on horse_lame_flags (status);
create index on horse_lame_flags (flag_type);
