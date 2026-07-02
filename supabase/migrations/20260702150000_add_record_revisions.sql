-- Version history + trash for workspace.records (Notion-parity safety net
-- under agent writes). Captured server-side by trigger so every write path
-- (app, MCP, agents, RPC) is covered automatically.
create table if not exists workspace.record_revisions (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null,
  database_id uuid not null,
  fields jsonb not null,
  body text,
  taxonomy jsonb not null default '{}'::jsonb,
  op text not null check (op in ('update', 'delete')),
  revised_at timestamptz not null default now()
);

create index if not exists record_revisions_record_idx
  on workspace.record_revisions (record_id, revised_at desc);
create index if not exists record_revisions_trash_idx
  on workspace.record_revisions (database_id, op, revised_at desc);

alter table workspace.record_revisions enable row level security;
grant select, insert on workspace.record_revisions to service_role;
revoke update, truncate on workspace.record_revisions from service_role;

create or replace function workspace.capture_record_revision()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    insert into workspace.record_revisions (record_id, database_id, fields, body, taxonomy, op)
    values (old.id, old.database_id, old.fields, old.body, old.taxonomy, 'delete');
    return old;
  end if;
  -- Only capture meaningful changes, not updated_at-only bumps.
  if old.fields is distinct from new.fields
     or old.body is distinct from new.body
     or old.taxonomy is distinct from new.taxonomy then
    insert into workspace.record_revisions (record_id, database_id, fields, body, taxonomy, op)
    values (old.id, old.database_id, old.fields, old.body, old.taxonomy, 'update');
  end if;
  return new;
end;
$$;

drop trigger if exists records_capture_revision on workspace.records;
create trigger records_capture_revision
  before update or delete on workspace.records
  for each row execute function workspace.capture_record_revision();

-- Server-side filter push-down support for jsonb field queries.
create index if not exists records_fields_gin_idx
  on workspace.records using gin (fields jsonb_path_ops);
