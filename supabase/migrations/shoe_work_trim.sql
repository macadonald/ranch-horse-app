-- Add 'trim' to what_needed options in shoe_needs
alter table shoe_needs drop constraint if exists shoe_needs_what_needed_check;
alter table shoe_needs add constraint shoe_needs_what_needed_check
  check (what_needed in ('fronts', 'rears', 'all_4s', 'trim', 'reset', 'full_set'));

-- Add 'trim' to work_done options in farrier_visit_horses
alter table farrier_visit_horses drop constraint if exists farrier_visit_horses_work_done_check;
alter table farrier_visit_horses add constraint farrier_visit_horses_work_done_check
  check (work_done in ('fronts', 'rears', 'all_4s', 'trim', 'reset', 'full_set'));
