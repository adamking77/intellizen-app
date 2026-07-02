-- Append-only structured event/receipt log for agent coordination.
-- Insert-only by design: no update/delete surface, so concurrent agents can
-- never race or rewrite history. Body markdown sections remain the rendered
-- view; this table is the durable audit substrate (plan Phase 6).
create table if not exists workspace.work_events (
  id uuid primary key default gen_random_uuid(),
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

create index if not exists work_events_record_created_idx
  on workspace.work_events (record_id, created_at desc);
create index if not exists work_events_run_created_idx
  on workspace.work_events (workflow_run_id, created_at desc);
create index if not exists work_events_kind_created_idx
  on workspace.work_events (event_kind, created_at desc);

alter table workspace.work_events enable row level security;

grant select, insert on workspace.work_events to service_role;
revoke update, delete, truncate on workspace.work_events from service_role;
revoke update, delete, truncate on workspace.work_events from authenticated;
revoke update, delete, truncate on workspace.work_events from anon;
