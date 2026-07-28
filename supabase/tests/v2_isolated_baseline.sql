-- Normalize the legacy pre-migration tables into the structural Supabase
-- schemas that existed on the hosted project before the checked-in 20260610
-- migration. This file is test bootstrap only; it is never applied remotely.
create schema if not exists anchors;
create schema if not exists ingest;
create schema if not exists intel;
create schema if not exists workspace;

alter table public.operations set schema anchors;
alter table public.projects set schema anchors;
alter table public.vault_files set schema ingest;
alter table public.intel_signals set schema intel;
alter table intel.intel_signals rename to signals;
alter table public.monitors set schema intel;
alter table public.project_signals set schema intel;
alter table public.graph_nodes set schema intel;
alter table public.graph_edges set schema intel;
alter table public.investigations set schema intel;
alter table public.investigation_signals set schema intel;
alter table public.workspace_databases set schema workspace;
alter table workspace.workspace_databases rename to databases;
alter table public.workspace_views set schema workspace;
alter table workspace.workspace_views rename to views;
alter table public.workspace_records set schema workspace;
alter table workspace.workspace_records rename to records;
alter table public.workspace_nodes set schema workspace;
alter table workspace.workspace_nodes rename to nodes;
alter table public.canvas_documents set schema workspace;
alter table workspace.canvas_documents rename to canvases;

alter table workspace.databases
  add column if not exists taxonomy jsonb not null default '{}'::jsonb;
alter table anchors.operations
  add column if not exists taxonomy jsonb not null default '{}'::jsonb;
alter table anchors.projects
  add column if not exists taxonomy jsonb not null default '{}'::jsonb;

insert into workspace.databases (
  id,
  name,
  icon,
  schema,
  header_field_ids,
  taxonomy
)
values
(
  'c1000000-0000-0000-0000-000000000001',
  'Workflow Registry',
  'intel-system:workflow-registry',
  '[]'::jsonb,
  '[]'::jsonb,
  '{"entity":"genzen","object_type":"workflow_registry"}'::jsonb
),
(
  'c1000000-0000-0000-0000-000000000002',
  'Workflow Runs',
  'intel-system:workflow-runs',
  '[]'::jsonb,
  '[]'::jsonb,
  '{"entity":"genzen","object_type":"workflow_runs"}'::jsonb
)
on conflict (id) do nothing;
