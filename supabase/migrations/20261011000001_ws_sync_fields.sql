alter table guests
  add column if not exists ws_guest_id       integer unique,
  add column if not exists ws_reservation_id integer,
  add column if not exists ws_confirmation   text,
  add column if not exists ws_synced_at      timestamptz;
