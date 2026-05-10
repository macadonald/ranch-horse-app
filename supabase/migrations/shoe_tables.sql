-- Run this in the Supabase SQL editor

create table if not exists shoe_needs (
  id uuid primary key default gen_random_uuid(),
  horse_name text not null,
  what_needed text not null check (what_needed in ('fronts', 'rears', 'all_4s', 'reset', 'full_set')),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists farrier_visits (
  id uuid primary key default gen_random_uuid(),
  visit_date date not null,
  farrier_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists farrier_visit_horses (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references farrier_visits(id) on delete cascade,
  horse_name text not null,
  work_done text not null check (work_done in ('fronts', 'rears', 'all_4s', 'reset', 'full_set')),
  notes text,
  created_at timestamptz not null default now()
);
