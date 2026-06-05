-- Fix shoe_type constraints on both tables to include 'trim' and 'pad'.
-- 'pad' was in the frontend SHOE_TYPES but missing from the DB constraint.
-- 'trim' is now a valid shoe_type (barefoot/trim-only horse).
-- Also re-applies the what_needed / work_done 'trim' fix from shoe_work_trim.sql
-- in case that migration was never run.

alter table shoe_needs drop constraint if exists shoe_needs_shoe_type_check;
alter table shoe_needs add constraint shoe_needs_shoe_type_check
  check (shoe_type in ('regular', 'nb', 'nb_pad', 'pad', 'trim', 'plastics'));

alter table farrier_visit_horses drop constraint if exists farrier_visit_horses_shoe_type_check;
alter table farrier_visit_horses add constraint farrier_visit_horses_shoe_type_check
  check (shoe_type is null or shoe_type in ('regular', 'nb', 'nb_pad', 'pad', 'trim', 'plastics'));

-- Ensure what_needed allows 'trim' (idempotent — safe to run even if shoe_work_trim.sql already ran)
alter table shoe_needs drop constraint if exists shoe_needs_what_needed_check;
alter table shoe_needs add constraint shoe_needs_what_needed_check
  check (what_needed in ('fronts', 'rears', 'all_4s', 'trim', 'reset', 'full_set'));

-- Ensure work_done allows 'trim' (idempotent)
alter table farrier_visit_horses drop constraint if exists farrier_visit_horses_work_done_check;
alter table farrier_visit_horses add constraint farrier_visit_horses_work_done_check
  check (work_done in ('fronts', 'rears', 'all_4s', 'trim', 'reset', 'full_set'));
