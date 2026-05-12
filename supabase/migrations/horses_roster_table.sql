create table if not exists horses (
  id              uuid        primary key default gen_random_uuid(),
  name            text        unique not null,
  level           text        not null default 'B',
  weight          integer,
  size            text        not null default 'medium'
                              check (size in ('small','medium','large','draft')),
  notes           text        not null default '',
  is_active       boolean     not null default true,
  exclude_from_ai boolean     not null default false,
  rank_last       boolean     not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists horses_is_active_idx on horses(is_active);
create index if not exists horses_name_idx      on horses(name);
