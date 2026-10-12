alter table guests
  drop column if exists ws_guest_id,
  drop column if exists ws_reservation_id,
  drop column if exists ws_confirmation,
  drop column if exists ws_synced_at;

alter table guests
  add column if not exists external_source          text,
  add column if not exists external_guest_id        text,
  add column if not exists external_reservation_id  text,
  add column if not exists external_confirmation    text,
  add column if not exists external_synced_at       timestamptz;

create unique index if not exists guests_external_source_guest_id_key
  on guests (external_source, external_guest_id);
