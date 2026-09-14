alter table public.study_contests
  add column if not exists target_accuracy numeric(5,2) not null default 100;

alter table public.study_contests
  drop constraint if exists study_contests_target_accuracy_check;

alter table public.study_contests
  add constraint study_contests_target_accuracy_check
  check (target_accuracy between 50 and 100);
