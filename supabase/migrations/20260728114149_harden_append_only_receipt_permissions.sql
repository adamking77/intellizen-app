-- Close two append-only receipt permission gaps found during the V2 backend
-- audit. Additive permission hardening only; no rows are changed.

alter function workspace.append_record_section(uuid, text, jsonb)
  set search_path = workspace, public, extensions, pg_temp;

revoke all on function workspace.append_record_section(uuid, text, jsonb)
  from public, authenticated;
grant execute on function workspace.append_record_section(uuid, text, jsonb)
  to anon, service_role;

revoke delete on workspace.record_revisions from service_role;
