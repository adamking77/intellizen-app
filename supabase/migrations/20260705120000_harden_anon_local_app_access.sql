-- Harden publishable-key access for the local IntelliZen desktop app.
--
-- The frontend now uses the anon key so service-role credentials are never
-- bundled into a DMG. That makes the anon key insufficient as an access
-- boundary by itself. This migration requires a per-machine local access
-- secret in the `x-intellizen-local-access` header for all exposed app-table
-- reads/writes, removes unused authenticated-role access, and removes broad
-- DML grants from the public memory bridge views.

create or replace function system.intellizen_local_access_ok()
returns boolean
language plpgsql
security definer
set search_path = system, public, extensions, pg_temp
as $$
declare
  raw_headers text;
  headers jsonb;
  provided_secret text;
  expected_sha256 text;
begin
  raw_headers := current_setting('request.headers', true);
  if raw_headers is null or raw_headers = '' then
    return false;
  end if;

  headers := raw_headers::jsonb;
  provided_secret := headers ->> 'x-intellizen-local-access';
  if provided_secret is null or length(provided_secret) < 32 then
    return false;
  end if;

  select content
    into expected_sha256
  from system.config
  where file_path = 'secrets/intellizen-local-access-sha256'
  order by updated_at desc nulls last, id desc
  limit 1;

  if expected_sha256 is null then
    return false;
  end if;

  return encode(extensions.digest(provided_secret, 'sha256'), 'hex') = expected_sha256;
exception
  when others then
    return false;
end;
$$;

revoke all on function system.intellizen_local_access_ok() from public;
grant execute on function system.intellizen_local_access_ok() to anon, authenticated, service_role;

update system.config
set content = 'd49ad3b20e2d20091508e695b6cb3e471dbdfcd168a093d11e350b415034932b',
    file_type = 'settings',
    updated_at = now()
where file_path = 'secrets/intellizen-local-access-sha256';

insert into system.config (file_path, content, file_type, updated_at)
select
  'secrets/intellizen-local-access-sha256',
  'd49ad3b20e2d20091508e695b6cb3e471dbdfcd168a093d11e350b415034932b',
  'settings',
  now()
where not exists (
  select 1
  from system.config
  where file_path = 'secrets/intellizen-local-access-sha256'
);

do $$
declare
  tbl regclass;
  full_crud_tables text[] := array[
    'anchors.operations',
    'anchors.projects',
    'ingest.vault_files',
    'intel.entities',
    'intel.entity_signals',
    'intel.graph_edges',
    'intel.graph_nodes',
    'intel.investigation_signals',
    'intel.investigations',
    'intel.monitors',
    'intel.project_signals',
    'intel.signals',
    'knowledge.documents',
    'workspace.canvases',
    'workspace.databases',
    'workspace.nodes',
    'workspace.records',
    'workspace.views'
  ];
  mutable_no_delete_tables text[] := array[
    'comms.fiona_inbox'
  ];
  append_only_tables text[] := array[
    'intel.claims',
    'workspace.record_revisions',
    'workspace.work_events'
  ];
  name text;
begin
  foreach name in array full_crud_tables loop
    tbl := name::regclass;
    execute format('drop policy if exists personal_app_rw on %s', tbl);
    execute format('drop policy if exists personal_app_local_access on %s', tbl);
    execute format('revoke all privileges on %s from authenticated', tbl);
    execute format('revoke all privileges on %s from anon', tbl);
    execute format('grant select, insert, update, delete on %s to anon', tbl);
    execute format(
      'create policy personal_app_local_access on %s for all to anon using (system.intellizen_local_access_ok()) with check (system.intellizen_local_access_ok())',
      tbl
    );
  end loop;

  foreach name in array mutable_no_delete_tables loop
    tbl := name::regclass;
    execute format('drop policy if exists personal_app_rw on %s', tbl);
    execute format('drop policy if exists personal_app_local_access on %s', tbl);
    execute format('revoke all privileges on %s from authenticated', tbl);
    execute format('revoke all privileges on %s from anon', tbl);
    execute format('grant select, insert, update on %s to anon', tbl);
    execute format(
      'create policy personal_app_local_access on %s for all to anon using (system.intellizen_local_access_ok()) with check (system.intellizen_local_access_ok())',
      tbl
    );
  end loop;

  foreach name in array append_only_tables loop
    tbl := name::regclass;
    execute format('drop policy if exists personal_app_rw on %s', tbl);
    execute format('drop policy if exists personal_app_local_access on %s', tbl);
    execute format('revoke all privileges on %s from authenticated', tbl);
    execute format('revoke all privileges on %s from anon', tbl);
    execute format('grant select, insert on %s to anon', tbl);
    execute format(
      'create policy personal_app_local_access on %s for all to anon using (system.intellizen_local_access_ok()) with check (system.intellizen_local_access_ok())',
      tbl
    );
  end loop;
end;
$$;

revoke all privileges on public.memory from anon, authenticated;
revoke all privileges on public.memory_chunks from anon, authenticated;
grant select on public.memory to anon;
grant select on public.memory_chunks to anon;
