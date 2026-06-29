alter table horses
  add column if not exists is_draft boolean not null default false,
  add column if not exists takes_kids boolean not null default false;
