-- The navigation tree: department → workspace → project (recursive).
--
-- Why: ROADMAP "The tree". Operations, projects and investigations stop being
-- three separate ways to navigate; a client case becomes a project in one
-- tree that every agent and MCP tool can read. Nothing is deleted: every
-- anchors.operations, anchors.projects and intel.investigations row is filed
-- into a node here and keeps its own id in a legacy_* column, so vault_files,
-- signals and the intel tables keep pointing at the rows they always did.
-- Refiling is idempotent: re-running workspace.file_legacy_hierarchy() only
-- files rows that have no node yet.

create table if not exists workspace.hierarchy_nodes (
  id                      uuid primary key default gen_random_uuid(),
  kind                    text not null check (kind in ('department', 'workspace', 'project')),
  parent_id               uuid null references workspace.hierarchy_nodes(id) on delete cascade,
  name                    text not null,
  folders                 jsonb not null default '[]'::jsonb,
  position                integer not null default 0,
  legacy_operation_id     bigint null,
  legacy_project_id       bigint null,
  legacy_investigation_id bigint null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists hierarchy_nodes_parent_id_idx
  on workspace.hierarchy_nodes (parent_id, position);
create unique index if not exists hierarchy_nodes_legacy_operation_id_idx
  on workspace.hierarchy_nodes (legacy_operation_id) where legacy_operation_id is not null;
create unique index if not exists hierarchy_nodes_legacy_project_id_idx
  on workspace.hierarchy_nodes (legacy_project_id) where legacy_project_id is not null;
create unique index if not exists hierarchy_nodes_legacy_investigation_id_idx
  on workspace.hierarchy_nodes (legacy_investigation_id) where legacy_investigation_id is not null;

drop trigger if exists hierarchy_nodes_updated_at on workspace.hierarchy_nodes;
create trigger hierarchy_nodes_updated_at
  before update on workspace.hierarchy_nodes
  for each row execute function public.update_updated_at();

-- Parent rules: a department has no parent, a workspace sits under a
-- department, a project sits under a workspace or another project.
create or replace function workspace.hierarchy_nodes_check_parent()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
declare
  parent_kind text;
begin
  if new.kind = 'department' then
    if new.parent_id is not null then
      raise exception 'a department has no parent';
    end if;
    return new;
  end if;

  if new.parent_id is null then
    raise exception 'a % needs a parent', new.kind;
  end if;
  if new.parent_id = new.id then
    raise exception 'a node cannot be its own parent';
  end if;

  select kind into parent_kind from workspace.hierarchy_nodes where id = new.parent_id;
  if parent_kind is null then
    raise exception 'parent % does not exist', new.parent_id;
  end if;

  if new.kind = 'workspace' and parent_kind <> 'department' then
    raise exception 'a workspace sits under a department, not a %', parent_kind;
  end if;
  if new.kind = 'project' and parent_kind not in ('workspace', 'project') then
    raise exception 'a project sits under a workspace or a project, not a %', parent_kind;
  end if;
  return new;
end;
$$;

drop trigger if exists hierarchy_nodes_check_parent on workspace.hierarchy_nodes;
create trigger hierarchy_nodes_check_parent
  before insert or update of kind, parent_id on workspace.hierarchy_nodes
  for each row execute function workspace.hierarchy_nodes_check_parent();

-- RLS: same personal-app pattern as 20260703090922.
alter table workspace.hierarchy_nodes enable row level security;
revoke all privileges on workspace.hierarchy_nodes from authenticated;
revoke all privileges on workspace.hierarchy_nodes from anon;
grant select, insert, update, delete on workspace.hierarchy_nodes to anon;
drop policy if exists personal_app_local_access on workspace.hierarchy_nodes;
create policy personal_app_local_access on workspace.hierarchy_nodes
  for all to anon
  using (system.intellizen_local_access_ok())
  with check (system.intellizen_local_access_ok());

-- File every legacy row into the tree. Safe to re-run.
create or replace function workspace.file_legacy_hierarchy()
returns void
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
declare
  dept uuid;
  unfiled uuid;
begin
  select id into dept
  from workspace.hierarchy_nodes
  where kind = 'department' and name = 'GenZen Solutions'
  order by created_at
  limit 1;
  if dept is null then
    insert into workspace.hierarchy_nodes (kind, name)
    values ('department', 'GenZen Solutions')
    returning id into dept;
  end if;

  -- Each operation is a workspace.
  insert into workspace.hierarchy_nodes (kind, parent_id, name, legacy_operation_id)
  select 'workspace', dept, o.name, o.id
  from anchors.operations o
  where not exists (
    select 1 from workspace.hierarchy_nodes h where h.legacy_operation_id = o.id
  );

  -- 'Unfiled' holds whatever has no operation. Created only when needed.
  if exists (
    select 1 from anchors.projects p
    where p.operation_id is null
      and not exists (select 1 from workspace.hierarchy_nodes h where h.legacy_project_id = p.id)
  ) or exists (
    select 1 from intel.investigations i
    where i.project_id is null and i.operation_id is null
      and not exists (select 1 from workspace.hierarchy_nodes h where h.legacy_investigation_id = i.id)
  ) then
    select id into unfiled
    from workspace.hierarchy_nodes
    where kind = 'workspace' and parent_id = dept and name = 'Unfiled' and legacy_operation_id is null
    order by created_at
    limit 1;
    if unfiled is null then
      insert into workspace.hierarchy_nodes (kind, parent_id, name)
      values ('workspace', dept, 'Unfiled')
      returning id into unfiled;
    end if;
  end if;

  -- Each project is a project under its operation's workspace, else Unfiled.
  insert into workspace.hierarchy_nodes (kind, parent_id, name, legacy_project_id)
  select 'project', coalesce(w.id, unfiled), p.name, p.id
  from anchors.projects p
  left join workspace.hierarchy_nodes w
    on w.kind = 'workspace' and w.legacy_operation_id = p.operation_id
  where not exists (
    select 1 from workspace.hierarchy_nodes h where h.legacy_project_id = p.id
  );

  -- A project with exactly one investigation: the investigation is that project.
  update workspace.hierarchy_nodes n
  set legacy_investigation_id = s.investigation_id
  from (
    select i.project_id, min(i.id) as investigation_id
    from intel.investigations i
    where i.project_id is not null
    group by i.project_id
    having count(*) = 1
  ) s
  where n.legacy_project_id = s.project_id
    and n.legacy_investigation_id is null
    and not exists (
      select 1 from workspace.hierarchy_nodes h where h.legacy_investigation_id = s.investigation_id
    );

  -- A project with several investigations: each becomes a child project.
  insert into workspace.hierarchy_nodes (kind, parent_id, name, legacy_investigation_id)
  select 'project', n.id, i.name, i.id
  from intel.investigations i
  join workspace.hierarchy_nodes n on n.legacy_project_id = i.project_id
  where i.project_id in (
    select project_id from intel.investigations
    where project_id is not null
    group by project_id
    having count(*) > 1
  )
  and not exists (
    select 1 from workspace.hierarchy_nodes h where h.legacy_investigation_id = i.id
  );

  -- An investigation with no project: a project under its operation, else Unfiled.
  insert into workspace.hierarchy_nodes (kind, parent_id, name, legacy_investigation_id)
  select 'project', coalesce(w.id, unfiled), i.name, i.id
  from intel.investigations i
  left join workspace.hierarchy_nodes w
    on w.kind = 'workspace' and w.legacy_operation_id = i.operation_id
  where i.project_id is null
    and not exists (
      select 1 from workspace.hierarchy_nodes h where h.legacy_investigation_id = i.id
    );
end;
$$;

revoke all on function workspace.file_legacy_hierarchy() from public;
grant execute on function workspace.file_legacy_hierarchy() to service_role;

select workspace.file_legacy_hierarchy();
