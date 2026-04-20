create extension if not exists pgcrypto;

create table if not exists workspace_databases (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  icon             text,
  schema           jsonb not null default '[]'::jsonb,
  header_field_ids jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists workspace_views (
  id          uuid primary key default gen_random_uuid(),
  database_id uuid not null references workspace_databases(id) on delete cascade,
  name        text not null,
  type        text not null check (type in ('table', 'kanban', 'list', 'gallery', 'calendar')),
  config      jsonb not null default '{"sort":[],"filter":[],"hiddenFields":[]}'::jsonb,
  position    int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists workspace_records (
  id          uuid primary key default gen_random_uuid(),
  database_id uuid not null references workspace_databases(id) on delete cascade,
  fields      jsonb not null default '{}'::jsonb,
  body        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists workspace_databases_updated_at_idx on workspace_databases (updated_at desc);
create index if not exists workspace_views_database_id_idx on workspace_views (database_id);
create index if not exists workspace_views_position_idx on workspace_views (database_id, position);
create index if not exists workspace_records_database_id_idx on workspace_records (database_id);
create index if not exists workspace_records_updated_at_idx on workspace_records (database_id, updated_at desc);

drop trigger if exists workspace_databases_updated_at on workspace_databases;
create trigger workspace_databases_updated_at
  before update on workspace_databases
  for each row execute function update_updated_at();

drop trigger if exists workspace_views_updated_at on workspace_views;
create trigger workspace_views_updated_at
  before update on workspace_views
  for each row execute function update_updated_at();

drop trigger if exists workspace_records_updated_at on workspace_records;
create trigger workspace_records_updated_at
  before update on workspace_records
  for each row execute function update_updated_at();
