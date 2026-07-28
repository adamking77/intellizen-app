-- Consequential workflow updates and their append-only work event must commit
-- together. Telemetry can remain best-effort, but approvals, verification, and
-- external-action evidence cannot succeed without a durable receipt.
create or replace function workspace.append_record_section_with_event(
  p_record_id uuid,
  p_section text,
  p_fields_patch jsonb,
  p_workflow_run_id uuid,
  p_event_kind text,
  p_actor text,
  p_durable_role text default null,
  p_decision_role text default null,
  p_summary text default null,
  p_payload jsonb default '{}'::jsonb
)
returns workspace.records
language plpgsql
security invoker
set search_path = workspace, public, extensions, pg_temp
as $$
declare
  result workspace.records;
begin
  if p_section is null or length(trim(p_section)) = 0 then
    raise exception 'append_record_section_with_event requires a non-empty section';
  end if;
  if p_event_kind is null or length(trim(p_event_kind)) = 0 then
    raise exception 'append_record_section_with_event requires an event kind';
  end if;
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'append_record_section_with_event requires an actor';
  end if;

  update workspace.records
  set body = case
        when coalesce(rtrim(body, E' \t\n\r'), '') = '' then p_section
        else rtrim(body, E' \t\n\r') || E'\n\n' || p_section
      end,
      fields = case
        when p_fields_patch is null then fields
        else fields || p_fields_patch
      end,
      updated_at = now()
  where id = p_record_id
  returning * into result;

  if not found then
    raise exception 'workspace record % not found', p_record_id;
  end if;

  insert into workspace.work_events (
    record_id,
    workflow_run_id,
    event_kind,
    actor,
    durable_role,
    decision_role,
    summary,
    payload
  )
  values (
    p_record_id,
    p_workflow_run_id,
    p_event_kind,
    p_actor,
    p_durable_role,
    p_decision_role,
    p_summary,
    coalesce(p_payload, '{}'::jsonb)
  );

  return result;
end;
$$;

revoke all on function workspace.append_record_section_with_event(
  uuid, text, jsonb, uuid, text, text, text, text, text, jsonb
) from public, authenticated;
grant execute on function workspace.append_record_section_with_event(
  uuid, text, jsonb, uuid, text, text, text, text, text, jsonb
) to anon, service_role;
