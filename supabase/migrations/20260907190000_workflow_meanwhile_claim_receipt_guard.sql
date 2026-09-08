-- Correct the side-claim receipt readiness check without widening ledger access.
-- The original migration remains immutable because it is already applied.

create or replace function workspace.transition_workflow_side_step(
  p_workflow_run_id uuid,
  p_expected_run_version bigint,
  p_approval_step_id text,
  p_expected_approval_state text,
  p_side_step_id text,
  p_expected_side_step_state text,
  p_next_side_step_state text,
  p_dispatcher_session uuid,
  p_fencing_token bigint,
  p_idempotency_key text,
  p_request_hash text,
  p_actor text,
  p_event_kind text,
  p_event_summary text,
  p_event_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = workspace, public, extensions, pg_temp
as $$
declare
  v_run workspace.records;
  v_event workspace.work_events;
  v_duplicate workspace.work_events;
  v_current_version bigint;
  v_next_version bigint;
  v_states jsonb;
  v_definition jsonb;
  v_approval_step jsonb;
  v_side_step jsonb;
  v_assignment_id uuid;
  v_runtime_session_id text;
  v_section text;
  v_result jsonb;
  v_execution_version bigint;
  v_definition_hash text;
  v_continuation jsonb;
begin
  if not system.intellizen_local_access_ok() then
    raise exception 'Local access authority is required';
  end if;
  if p_expected_run_version is null or p_expected_run_version < 0
    or p_approval_step_id is null or nullif(btrim(p_approval_step_id), '') is null
    or p_expected_approval_state is distinct from 'running'
    or p_side_step_id is null or nullif(btrim(p_side_step_id), '') is null
    or p_expected_side_step_state is null or nullif(btrim(p_expected_side_step_state), '') is null
    or p_next_side_step_state is null or nullif(btrim(p_next_side_step_state), '') is null
    or p_idempotency_key is null or nullif(btrim(p_idempotency_key), '') is null
    or p_request_hash is null or p_request_hash !~ '^[a-f0-9]{64}$'
    or p_actor is null or nullif(btrim(p_actor), '') is null
    or p_event_kind is null or nullif(btrim(p_event_kind), '') is null
    or p_event_summary is null or nullif(btrim(p_event_summary), '') is null
    or p_dispatcher_session is null
    or p_fencing_token is null or p_fencing_token < 0
  then
    raise exception 'Workflow side transition requires CAS, receipt, idempotency, and actor fields';
  end if;
  if jsonb_typeof(coalesce(p_event_payload, '{}'::jsonb)) <> 'object' then
    raise exception 'Workflow event payload must be a JSON object';
  end if;
  if not (
    (p_expected_side_step_state = 'queued' and p_next_side_step_state in ('running', 'blocked', 'cancelled'))
    or (p_expected_side_step_state = 'running' and p_next_side_step_state in ('completed', 'blocked', 'cancelled', 'abandoned'))
  ) then
    raise exception 'Illegal workflow side state edge % -> %',
      p_expected_side_step_state,
      p_next_side_step_state;
  end if;
  if (p_next_side_step_state = 'running' and p_event_kind is distinct from 'meanwhile_assignment_created')
    or (p_next_side_step_state = 'completed' and p_event_kind is distinct from 'meanwhile_completed')
    or (p_next_side_step_state = 'blocked' and p_event_kind is distinct from 'meanwhile_blocked')
    or (p_next_side_step_state = 'cancelled' and p_event_kind is distinct from 'meanwhile_cancelled')
    or (p_next_side_step_state = 'abandoned' and p_event_kind is distinct from 'meanwhile_abandoned')
  then
    raise exception 'Workflow side state % requires its canonical event kind',
      p_next_side_step_state;
  end if;
  if p_next_side_step_state = 'running'
    and nullif(p_event_payload->>'assignmentId', '') is null
  then
    raise exception 'Workflow side assignment start requires an assignmentId';
  end if;

  select * into v_run
  from workspace.records
  where id = p_workflow_run_id
  for update;

  if not found or v_run.database_id <> 'c1000000-0000-0000-0000-000000000002' then
    raise exception 'Workflow Run % not found', p_workflow_run_id;
  end if;
  if v_run.fields->>'run_schema_version' is distinct from 'intellizen.workflow/1' then
    raise exception 'Workflow Run % is not schema v1', p_workflow_run_id;
  end if;
  select * into v_duplicate
  from workspace.work_events
  where workflow_run_id = p_workflow_run_id
    and idempotency_key = p_idempotency_key;
  if found then
    if v_duplicate.request_hash is distinct from p_request_hash then
      raise exception 'Idempotency key reuse with a different request hash';
    end if;
    if v_duplicate.payload->>'executionVersion'
        is distinct from v_run.fields->>'run_execution_version'
      or v_duplicate.payload->>'definitionHash'
        is distinct from v_run.fields->>'run_definition_hash'
    then
      raise exception 'Idempotency receipt belongs to another workflow execution';
    end if;
    return coalesce(v_duplicate.payload->'_rpc_result', '{}'::jsonb)
      || jsonb_build_object('duplicate', true, 'event', to_jsonb(v_duplicate));
  end if;

  v_current_version := coalesce((v_run.fields->>'run_version')::bigint, 0);
  if v_current_version <> p_expected_run_version then
    raise exception 'Workflow Run version mismatch: expected %, current %',
      p_expected_run_version,
      v_current_version;
  end if;
  if v_run.fields->>'run_current_step_id' is distinct from p_approval_step_id then
    raise exception 'Workflow approval cursor mismatch: expected %, current %',
      p_approval_step_id,
      v_run.fields->>'run_current_step_id';
  end if;

  v_states := coalesce(v_run.fields->'run_step_states', '{}'::jsonb);
  if jsonb_typeof(v_states) <> 'object'
    or v_states->>p_approval_step_id is distinct from p_expected_approval_state
  then
    raise exception 'Workflow approval state mismatch';
  end if;
  if v_states->>p_side_step_id is distinct from p_expected_side_step_state then
    raise exception 'Workflow side step state mismatch: expected %, current %',
      p_expected_side_step_state,
      v_states->>p_side_step_id;
  end if;

  if v_run.fields->>'run_dispatcher_session' is distinct from p_dispatcher_session::text
    or coalesce((v_run.fields->>'run_fencing_token')::bigint, -1) <> p_fencing_token
  then
    raise exception 'Stale dispatcher lease';
  end if;
  if nullif(v_run.fields->>'run_lease_expires_at', '')::timestamptz is null
    or nullif(v_run.fields->>'run_lease_expires_at', '')::timestamptz <= clock_timestamp()
  then
    raise exception 'Dispatcher lease expired';
  end if;

  begin
    v_definition := (v_run.fields->>'run_definition_snapshot')::jsonb;
  exception when others then
    raise exception 'Workflow definition snapshot is invalid';
  end;
  if jsonb_typeof(v_definition->'steps') <> 'array' then
    raise exception 'Workflow definition snapshot has no steps';
  end if;
  select value into v_approval_step
  from jsonb_array_elements(v_definition->'steps')
  where value->>'id' = p_approval_step_id;
  select value into v_side_step
  from jsonb_array_elements(v_definition->'steps')
  where value->>'id' = p_side_step_id;
  if v_approval_step->>'kind' is distinct from 'approval'
    or jsonb_typeof(v_approval_step->'meanwhile') is distinct from 'array'
    or coalesce(v_approval_step->'meanwhile' ? p_side_step_id, false) = false
    or v_side_step->>'kind' is distinct from 'role-assign'
  then
    raise exception 'Side step % is not declared by approval %',
      p_side_step_id,
      p_approval_step_id;
  end if;
  begin
    v_execution_version := (v_run.fields->>'run_execution_version')::bigint;
  exception when others then
    raise exception 'Workflow side transition requires immutable execution identity';
  end;
  v_definition_hash := v_run.fields->>'run_definition_hash';
  perform workspace.workflow_run_execution_identity(
    p_workflow_run_id,
    v_execution_version,
    v_definition_hash,
    v_definition,
    v_states
  );
  v_continuation := workspace.get_workflow_run_continuation_v1(
    p_workflow_run_id
  );
  if v_continuation->>'continuationStatus' is distinct from 'ready'
    or exists (
      select 1 from jsonb_each_text(v_states) state
      where state.value = 'completed'
        and not exists (
          select 1
          from jsonb_array_elements(
            coalesce(v_continuation->'completedSteps', '[]'::jsonb)
          ) receipt
          where receipt->>'workflowRunId' = p_workflow_run_id::text
            and receipt->>'stepId' = state.key
            and receipt->>'executionVersion' = v_execution_version::text
            and receipt->>'definitionHash' = v_definition_hash
        )
    )
  then
    raise exception 'Workflow continuation status is not ready for this execution';
  end if;

  v_states := jsonb_set(
    v_states,
    array[p_side_step_id],
    to_jsonb(p_next_side_step_state::text),
    true
  );
  v_next_version := v_current_version + 1;
  v_section := format(
    '## %s - %s%s%s%s%s',
    p_event_kind,
    clock_timestamp(),
    E'\n\n',
    format('Actor: %s', p_actor),
    E'\n',
    p_event_summary
  );

  update workspace.records
  set fields = jsonb_set(
      jsonb_set(fields, '{run_version}', to_jsonb(v_next_version), true),
      '{run_step_states}',
      v_states,
      true
    ),
    body = concat_ws(E'\n\n', nullif(rtrim(body), ''), v_section),
    updated_at = now()
  where id = p_workflow_run_id
  returning * into v_run;

  v_result := jsonb_build_object(
    'applied', true,
    'duplicate', false,
    'run_version', v_next_version,
    'fencing_token', p_fencing_token,
    'run', to_jsonb(v_run)
  );
  if nullif(p_event_payload->>'assignmentId', '') is not null then
    begin
      v_assignment_id := (p_event_payload->>'assignmentId')::uuid;
    exception when invalid_text_representation then
      raise exception 'assignmentId must be a UUID';
    end;
  end if;
  v_runtime_session_id := nullif(p_event_payload->>'runtimeSessionId', '');

  insert into workspace.work_events (
    record_id, workflow_run_id, event_kind, actor, summary, payload,
    idempotency_key, request_hash, run_version, step_id, assignment_id,
    runtime_session_id
  ) values (
    p_workflow_run_id, p_workflow_run_id, p_event_kind, p_actor, p_event_summary,
    coalesce(p_event_payload, '{}'::jsonb) || jsonb_build_object(
      'executionVersion', v_execution_version,
      'definitionHash', v_definition_hash,
      'approvalStepId', p_approval_step_id,
      '_rpc_result', v_result
    ),
    p_idempotency_key, p_request_hash, v_next_version, p_side_step_id,
    v_assignment_id, v_runtime_session_id
  ) returning * into v_event;

  return v_result || jsonb_build_object('event', to_jsonb(v_event));
end;
$$;

revoke all on function workspace.transition_workflow_side_step(
  uuid, bigint, text, text, text, text, text, uuid, bigint, text, text,
  text, text, text, jsonb
) from public, authenticated;
grant execute on function workspace.transition_workflow_side_step(
  uuid, bigint, text, text, text, text, text, uuid, bigint, text, text,
  text, text, text, jsonb
) to anon, service_role;
