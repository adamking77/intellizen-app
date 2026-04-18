create table if not exists operations (
  id          bigint generated always as identity primary key,
  name        text not null,
  description text,
  status      text not null default 'active'
              check (status in ('active', 'archived')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists operations_status_idx on operations (status);

drop trigger if exists operations_updated_at on operations;
create trigger operations_updated_at
  before update on operations
  for each row execute function update_updated_at();

alter table projects
  add column if not exists operation_id bigint references operations(id) on delete set null;

create index if not exists projects_operation_id_idx on projects (operation_id);

alter table investigations
  add column if not exists operation_id bigint references operations(id) on delete set null;

create index if not exists investigations_operation_id_idx on investigations (operation_id);
