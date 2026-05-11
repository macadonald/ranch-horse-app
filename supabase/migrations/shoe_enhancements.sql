-- shoe_needs: add shoe type and drugger flag
alter table shoe_needs
  add column if not exists shoe_type text not null default 'regular'
    check (shoe_type in ('regular', 'nb', 'nb_pad', 'plastics')),
  add column if not exists is_drugger boolean not null default false;

-- farrier_visit_horses: add shoe type, size, and placement
alter table farrier_visit_horses
  add column if not exists shoe_type text
    check (shoe_type is null or shoe_type in ('regular', 'nb', 'nb_pad', 'plastics')),
  add column if not exists shoe_size text,
  add column if not exists placement text;

-- TODO: track size history per horse, surface last known size,
-- run analytics on shoe types and sizes across the herd
