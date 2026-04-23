alter table projects
  drop constraint if exists projects_status_check;

alter table projects
  add constraint projects_status_check
  check (status in ('active', 'on_hold', 'archived'));

alter table operations
  drop constraint if exists operations_status_check;

alter table operations
  add constraint operations_status_check
  check (status in ('active', 'on_hold', 'archived'));
