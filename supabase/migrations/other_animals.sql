create table if not exists other_animals (
  id         uuid    default gen_random_uuid() primary key,
  name       text    not null,
  group_name text    not null default 'Other',
  age        integer,
  notes      text,
  created_at timestamptz not null default now()
);

create index on other_animals (group_name);
