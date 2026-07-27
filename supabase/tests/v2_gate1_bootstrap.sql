-- Minimal ephemeral PostgreSQL substrate for Gate 1 migration/RPC tests.
-- This is not a production schema and is never applied by Supabase migrations.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin;

create schema extensions;
create schema workspace;
create extension pgcrypto with schema extensions;

create table workspace.databases (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null,
  icon text,
  schema jsonb not null default '[]'::jsonb,
  header_field_ids jsonb,
  taxonomy jsonb not null default '{}'::jsonb,
  entity text not null default 'genzen',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table workspace.records (
  id uuid primary key default extensions.gen_random_uuid(),
  database_id uuid not null references workspace.databases(id) on delete cascade,
  fields jsonb not null default '{}'::jsonb,
  body text,
  taxonomy jsonb not null default '{}'::jsonb,
  entity text not null default 'genzen',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table workspace.work_events (
  id uuid primary key default extensions.gen_random_uuid(),
  record_id uuid references workspace.records(id) on delete set null,
  workflow_run_id uuid,
  event_kind text not null,
  actor text not null,
  durable_role text,
  decision_role text,
  summary text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

grant usage on schema workspace, extensions to anon, authenticated, service_role;
grant select, insert, update, delete on workspace.databases, workspace.records
  to anon, service_role;
grant select, insert on workspace.work_events to anon, service_role;

insert into workspace.databases (
  id,
  name,
  icon,
  schema,
  header_field_ids,
  taxonomy,
  entity
)
values
(
  'c1000000-0000-0000-0000-000000000001',
  'Workflow Registry',
  'intel-system:workflow-registry',
  '[]'::jsonb,
  '[]'::jsonb,
  '{"entity":"genzen","system_kind":"workflow_registry"}'::jsonb,
  'genzen'
),
(
  'c1000000-0000-0000-0000-000000000002',
  'Workflow Runs',
  'intel-system:workflow-runs',
  '[]'::jsonb,
  '[]'::jsonb,
  '{"entity":"genzen","system_kind":"workflow_runs"}'::jsonb,
  'genzen'
);

