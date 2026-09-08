-- Hosted continuation objects that predate this repository's local migration
-- history. This fixture is loaded only by the isolated SQL contract runner.

alter table workspace.work_events
  add column if not exists contract_version integer not null default 1;

create table if not exists workspace.workflow_run_execution_versions (
  workflow_run_id uuid not null,
  execution_version bigint not null,
  definition_version bigint not null,
  definition_hash text not null,
  definition_snapshot jsonb not null,
  applied_from_step_id text,
  activated_at_run_version bigint,
  activation_kind text not null,
  activation_event_id uuid,
  actor text,
  created_at timestamptz not null default now(),
  primary key (workflow_run_id, execution_version),
  unique (workflow_run_id, execution_version, definition_hash),
  check (definition_hash ~ '^[a-f0-9]{64}$'),
  check (execution_version > 0 and definition_version > 0),
  check (activation_kind in ('manual_start', 'trigger_start', 'legacy_adoption', 'live_edit'))
);

create table if not exists workspace.workflow_step_result_receipts (
  receipt_id uuid primary key,
  workflow_run_id uuid not null,
  execution_version bigint not null,
  definition_hash text not null,
  step_id text not null,
  completion_ordinal bigint not null,
  expected_run_version bigint not null,
  resulting_run_version bigint not null,
  result jsonb not null,
  result_hash text not null,
  transition_event_id uuid unique,
  actor text,
  completed_at timestamptz not null default now(),
  unique (workflow_run_id, execution_version, step_id, completion_ordinal),
  foreign key (workflow_run_id, execution_version, definition_hash)
    references workspace.workflow_run_execution_versions
      (workflow_run_id, execution_version, definition_hash),
  check (definition_hash ~ '^[a-f0-9]{64}$' and result_hash ~ '^[a-f0-9]{64}$'),
  check (completion_ordinal > 0)
);

create table if not exists workspace.workflow_run_completion_receipts (
  receipt_id uuid primary key,
  workflow_run_id uuid not null unique,
  execution_version bigint not null,
  definition_hash text not null,
  completion_run_version bigint not null,
  summary jsonb not null,
  summary_hash text not null,
  summary_event_id uuid unique,
  completed_at timestamptz not null default now(),
  foreign key (workflow_run_id, execution_version, definition_hash)
    references workspace.workflow_run_execution_versions
      (workflow_run_id, execution_version, definition_hash),
  check (definition_hash ~ '^[a-f0-9]{64}$' and summary_hash ~ '^[a-f0-9]{64}$')
);

alter table workspace.workflow_run_execution_versions enable row level security;
alter table workspace.workflow_step_result_receipts enable row level security;
alter table workspace.workflow_run_completion_receipts enable row level security;
revoke all on workspace.workflow_run_execution_versions from public, anon, authenticated;
revoke all on workspace.workflow_step_result_receipts from public, anon, authenticated;
revoke all on workspace.workflow_run_completion_receipts from public, anon, authenticated;
grant select, insert on workspace.workflow_run_execution_versions to service_role;
grant select, insert on workspace.workflow_step_result_receipts to service_role;
grant select, insert on workspace.workflow_run_completion_receipts to service_role;
grant usage on schema workspace, system to anon;

create or replace function workspace.jsonb_is_safe_integer_domain_v1(p_value jsonb)
returns boolean
language plpgsql
immutable parallel safe
set search_path = pg_catalog, workspace
as $$
declare
  v_item jsonb;
begin
  case jsonb_typeof(p_value)
    when 'null', 'boolean', 'string' then return true;
    when 'number' then
      return p_value::numeric = trunc(p_value::numeric)
        and p_value::numeric between -9007199254740991 and 9007199254740991;
    when 'array' then
      for v_item in select value from jsonb_array_elements(p_value) loop
        if not workspace.jsonb_is_safe_integer_domain_v1(v_item) then return false; end if;
      end loop;
      return true;
    when 'object' then
      for v_item in select value from jsonb_each(p_value) loop
        if not workspace.jsonb_is_safe_integer_domain_v1(v_item) then return false; end if;
      end loop;
      return true;
    else return false;
  end case;
end;
$$;

create or replace function workspace.canonical_json_v1(p_value jsonb)
returns text
language plpgsql
immutable parallel safe
set search_path = pg_catalog, workspace
as $$
declare
  v_result text;
begin
  case jsonb_typeof(p_value)
    when 'null' then return 'null';
    when 'boolean' then return p_value::text;
    when 'number' then
      if not workspace.jsonb_is_safe_integer_domain_v1(p_value) then
        raise exception 'Canonical JSON accepts safe integers only';
      end if;
      return trunc(p_value::numeric)::text;
    when 'string' then return to_json(p_value#>>'{}')::text;
    when 'array' then
      select '[' || coalesce(string_agg(
        workspace.canonical_json_v1(item.value), ',' order by item.ordinality
      ), '') || ']'
      into v_result
      from jsonb_array_elements(p_value) with ordinality as item(value, ordinality);
      return v_result;
    when 'object' then
      select '{' || coalesce(string_agg(
        to_json(item.key)::text || ':' || workspace.canonical_json_v1(item.value),
        ',' order by item.key collate "C"
      ), '') || '}'
      into v_result
      from jsonb_each(p_value) as item(key, value);
      return v_result;
    else raise exception 'Unsupported JSON value';
  end case;
end;
$$;

create or replace function workspace.jsonb_sha256_v1(p_value jsonb)
returns text
language sql
immutable parallel safe
set search_path = pg_catalog, workspace, extensions
as $$
  select encode(extensions.digest(workspace.canonical_json_v1(p_value), 'sha256'), 'hex')
$$;

create or replace function workspace.workflow_run_execution_identity(
  p_workflow_run_id uuid,
  p_execution_version bigint,
  p_definition_hash text,
  p_definition_snapshot jsonb,
  p_step_states jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, workspace
as $$
declare
  v_exec workspace.workflow_run_execution_versions%rowtype;
begin
  if not system.intellizen_local_access_ok() then
    raise exception 'Local access authority is required';
  end if;
  if p_execution_version is null or p_execution_version <= 0
    or p_definition_hash is null or p_definition_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Workflow Run execution identity is not ready: missing execution version or definition hash';
  end if;
  select * into v_exec
  from workspace.workflow_run_execution_versions
  where workflow_run_id = p_workflow_run_id
    and execution_version = p_execution_version
    and definition_hash = p_definition_hash;
  if not found then
    raise exception 'Workflow Run execution identity is not ready: no matching immutable execution version';
  end if;
  if workspace.jsonb_sha256_v1(v_exec.definition_snapshot) <> p_definition_hash
    or v_exec.definition_snapshot is distinct from p_definition_snapshot then
    raise exception 'Workflow execution definition snapshot is inconsistent with its identity';
  end if;
  if exists (
    select 1
    from jsonb_each_text(coalesce(p_step_states, '{}'::jsonb)) s
    where s.value = 'completed'
      and not exists (
        select 1 from workspace.workflow_step_result_receipts r
        where r.workflow_run_id = p_workflow_run_id and r.step_id = s.key
      )
  ) then
    raise exception 'Workflow continuation status is not ready: completed steps lack receipts';
  end if;
  return jsonb_build_object(
    'executionVersion', p_execution_version,
    'definitionHash', p_definition_hash
  );
end;
$$;

create or replace function workspace.get_workflow_run_continuation_v1(
  p_workflow_run_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, workspace
as $$
declare
  v_run workspace.records;
  v_exec workspace.workflow_run_execution_versions%rowtype;
  v_completion workspace.workflow_run_completion_receipts%rowtype;
  v_step_results jsonb;
  v_completed_steps jsonb;
  v_unreceipted_completion boolean;
begin
  if not system.intellizen_local_access_ok() then
    raise exception 'Local access authority is required';
  end if;
  select * into v_run from workspace.records
  where id = p_workflow_run_id
    and database_id = 'c1000000-0000-0000-0000-000000000002'
  for share;
  if not found then raise exception 'Workflow Run % not found', p_workflow_run_id; end if;
  if v_run.fields->>'run_schema_version' is distinct from 'intellizen.workflow/1' then
    raise exception 'Workflow Run % is not schema v1', p_workflow_run_id;
  end if;
  select * into v_exec from workspace.workflow_run_execution_versions
  where workflow_run_id = p_workflow_run_id order by execution_version desc limit 1;
  select * into v_completion from workspace.workflow_run_completion_receipts
  where workflow_run_id = p_workflow_run_id;
  select coalesce(jsonb_object_agg(step_id, receipt), '{}'::jsonb)
  into v_step_results
  from (
    select step_id, receipt from (
      select step_id,
        row_number() over (partition by step_id order by completion_ordinal desc) as rn,
        jsonb_build_object(
          'receiptId', receipt_id, 'workflowRunId', workflow_run_id,
          'executionVersion', execution_version, 'definitionHash', definition_hash,
          'stepId', step_id, 'completionOrdinal', completion_ordinal,
          'expectedRunVersion', expected_run_version,
          'resultingRunVersion', resulting_run_version, 'result', result,
          'resultHash', result_hash, 'eventId', transition_event_id,
          'actor', actor, 'completedAt', completed_at
        ) as receipt
      from workspace.workflow_step_result_receipts
      where workflow_run_id = p_workflow_run_id
    ) ranked where rn = 1
  ) latest;
  select coalesce(jsonb_agg(receipt order by resulting_run_version, receipt_id), '[]'::jsonb)
  into v_completed_steps
  from (
    select resulting_run_version, receipt_id, jsonb_build_object(
      'receiptId', receipt_id, 'workflowRunId', workflow_run_id,
      'executionVersion', execution_version, 'definitionHash', definition_hash,
      'stepId', step_id, 'completionOrdinal', completion_ordinal,
      'expectedRunVersion', expected_run_version,
      'resultingRunVersion', resulting_run_version, 'result', result,
      'resultHash', result_hash, 'eventId', transition_event_id,
      'actor', actor, 'completedAt', completed_at
    ) as receipt
    from workspace.workflow_step_result_receipts
    where workflow_run_id = p_workflow_run_id
  ) all_receipts;
  select exists (
    select 1 from jsonb_each_text(coalesce(v_run.fields->'run_step_states', '{}'::jsonb)) s
    where s.value = 'completed' and not exists (
      select 1 from workspace.workflow_step_result_receipts r
      where r.workflow_run_id = p_workflow_run_id and r.step_id = s.key
    )
  ) into v_unreceipted_completion;
  return jsonb_build_object(
    'schema', 'intellizen.workflow-run-continuation/1',
    'continuationStatus', case
      when v_exec.workflow_run_id is null or v_unreceipted_completion then 'legacy_partial'
      else 'ready' end,
    'run', jsonb_build_object(
      'workflowRunId', v_run.id, 'runStatus', v_run.fields->>'run_status',
      'runVersion', (v_run.fields->>'run_version')::bigint,
      'runExecutionVersion', (v_run.fields->>'run_execution_version')::bigint,
      'runCurrentStepId', v_run.fields->>'run_current_step_id',
      'runStepStates', v_run.fields->'run_step_states'
    ),
    'execution', case when v_exec.workflow_run_id is null then 'null'::jsonb else jsonb_build_object(
      'workflowRunId', v_exec.workflow_run_id,
      'executionVersion', v_exec.execution_version,
      'definitionVersion', v_exec.definition_version,
      'definitionHash', v_exec.definition_hash,
      'definitionSnapshot', v_exec.definition_snapshot,
      'activationKind', v_exec.activation_kind,
      'activationEventId', v_exec.activation_event_id,
      'actor', v_exec.actor, 'createdAt', v_exec.created_at
    ) end,
    'stepResults', v_step_results,
    'completedSteps', v_completed_steps,
    'completion', case when v_completion.workflow_run_id is null then 'null'::jsonb else jsonb_build_object(
      'receiptId', v_completion.receipt_id,
      'workflowRunId', v_completion.workflow_run_id,
      'executionVersion', v_completion.execution_version,
      'definitionHash', v_completion.definition_hash,
      'completionRunVersion', v_completion.completion_run_version,
      'summary', v_completion.summary, 'summaryHash', v_completion.summary_hash,
      'summaryEventId', v_completion.summary_event_id,
      'completedAt', v_completion.completed_at
    ) end
  );
end;
$$;

revoke all on function workspace.jsonb_sha256_v1(jsonb) from public, anon, authenticated;
revoke all on function workspace.workflow_run_execution_identity(uuid, bigint, text, jsonb, jsonb)
  from public, authenticated;
grant execute on function workspace.workflow_run_execution_identity(uuid, bigint, text, jsonb, jsonb)
  to anon, service_role;
revoke all on function workspace.get_workflow_run_continuation_v1(uuid)
  from public, authenticated;
grant execute on function workspace.get_workflow_run_continuation_v1(uuid)
  to anon, service_role;

-- The hosted functions require the local desktop header. The isolated harness
-- provisions a disposable secret instead of weakening the functions.
insert into system.config (file_path, content)
values (
  'secrets/intellizen-local-access-sha256',
  encode(extensions.digest(repeat('x', 32), 'sha256'), 'hex')
);
alter database postgres set request.headers =
  '{"x-intellizen-local-access":"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"}';

-- BEGIN HOSTED TRANSITION SNAPSHOT (live 2026-09-07; sha256: 993d45851173cf27414950a06ac0fc35603d237cc041d414fb762bc9cfaf5c23)
-- The harness extracts this body after legacy V2 contracts and before the
-- meanwhile contract, so those legacy fixtures remain intentionally unchanged.
\if false
CREATE OR REPLACE FUNCTION workspace.transition_workflow_step(p_workflow_run_id uuid, p_expected_run_version bigint, p_expected_step_id text, p_expected_step_state text, p_next_step_id text, p_next_step_state text, p_next_run_status text, p_dispatcher_session uuid, p_fencing_token bigint, p_idempotency_key text, p_request_hash text, p_actor text, p_event_kind text, p_event_summary text, p_event_payload jsonb DEFAULT '{}'::jsonb, p_approval_mutation jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'workspace'
AS $function$
declare
  v_run workspace.records;
  v_event workspace.work_events;
  v_duplicate workspace.work_events;
  v_current_version bigint;
  v_next_version bigint;
  v_current_step text;
  v_current_state text;
  v_states jsonb;
  v_approvals jsonb;
  v_approval jsonb;
  v_approval_id text;
  v_operation text;
  v_assignment_id uuid;
  v_runtime_session_id text;
  v_section text;
  v_result jsonb;
  v_continuation jsonb;
  v_continuation_execution_version bigint;
  v_continuation_hash text;
  v_exec_version workspace.workflow_run_execution_versions%rowtype;
  v_step_result jsonb;
  v_completion_ordinal bigint;
  v_result_hash text;
  v_receipt_id uuid;
  v_receipt_projection jsonb;
  v_summary_steps jsonb;
  v_completed_step_ids jsonb;
  v_summary jsonb;
  v_summary_hash text;
  v_summary_event_id uuid;
  v_completion workspace.workflow_run_completion_receipts%rowtype;
begin
  if not system.intellizen_local_access_ok() then
    raise exception 'Local access authority is required';
  end if;
  if p_expected_run_version < 0
    or p_expected_step_id is null
    or btrim(p_expected_step_id) = ''
    or p_expected_step_state is null
    or btrim(p_expected_step_state) = ''
    or p_next_step_id is null
    or btrim(p_next_step_id) = ''
    or p_next_step_state is null
    or btrim(p_next_step_state) = ''
    or p_next_run_status is null
    or btrim(p_next_run_status) = ''
    or p_idempotency_key is null
    or btrim(p_idempotency_key) = ''
    or p_request_hash is null
    or p_request_hash !~ '^[a-f0-9]{64}$'
    or p_actor is null
    or btrim(p_actor) = ''
    or p_event_kind is null
    or btrim(p_event_kind) = ''
    or p_event_summary is null
    or btrim(p_event_summary) = ''
  then
    raise exception 'Workflow transition requires CAS, receipt, idempotency, and actor fields';
  end if;
  if jsonb_typeof(coalesce(p_event_payload, '{}'::jsonb)) <> 'object' then
    raise exception 'Workflow event payload must be a JSON object';
  end if;
  if p_next_run_status not in (
    'Queued',
    'In progress',
    'Blocked',
    'Needs approval',
    'Done',
    'Deferred'
  ) then
    raise exception 'Unsupported Workflow Run status %', p_next_run_status;
  end if;

  select *
  into v_run
  from workspace.records
  where id = p_workflow_run_id
  for update;

  if not found
    or v_run.database_id <> 'c1000000-0000-0000-0000-000000000002'
  then
    raise exception 'Workflow Run % not found', p_workflow_run_id;
  end if;
  if v_run.fields->>'run_schema_version' is distinct from 'intellizen.workflow/1' then
    raise exception 'Workflow Run % is not schema v1', p_workflow_run_id;
  end if;

  select *
  into v_duplicate
  from workspace.work_events
  where workflow_run_id = p_workflow_run_id
    and idempotency_key = p_idempotency_key;

  if found then
    if v_duplicate.request_hash is distinct from p_request_hash then
      raise exception 'Idempotency key reuse with a different request hash';
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

  -- ---------------------------------------------------------------------
  -- Execution identity: exact reserved _continuation object, then mirror +
  -- immutable-row verification. Wrong or missing identity fails before any
  -- mutation.
  -- ---------------------------------------------------------------------
  v_continuation := p_event_payload->'_continuation';
  if v_continuation is null or jsonb_typeof(v_continuation) <> 'object' then
    raise exception 'Workflow transition requires a _continuation object';
  end if;
  if (select count(*) from jsonb_object_keys(v_continuation)) <> 4
    or v_continuation->>'schema' is distinct from 'intellizen.workflow-transition-continuation/1'
    or not (v_continuation ? 'executionVersion')
    or not (v_continuation ? 'definitionHash')
    or not (v_continuation ? 'stepResult')
  then
    raise exception 'Workflow transition _continuation must carry exactly schema, executionVersion, definitionHash, and stepResult';
  end if;
  v_continuation_execution_version := (v_continuation->>'executionVersion')::bigint;
  v_continuation_hash := v_continuation->>'definitionHash';
  if v_continuation_execution_version is null or v_continuation_execution_version <= 0
    or v_continuation_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Workflow transition _continuation carries an invalid execution version or definition hash';
  end if;
  if coalesce((v_run.fields->>'run_execution_version')::bigint, 0) <> v_continuation_execution_version then
    raise exception 'Workflow execution version mismatch: expected %, current %',
      v_continuation_execution_version,
      coalesce((v_run.fields->>'run_execution_version')::bigint, 0);
  end if;
  if v_run.fields->>'run_definition_hash' is distinct from v_continuation_hash then
    raise exception 'Workflow definition hash mismatch';
  end if;

  select *
  into v_exec_version
  from workspace.workflow_run_execution_versions
  where workflow_run_id = p_workflow_run_id
    and execution_version = v_continuation_execution_version
    and definition_hash = v_continuation_hash;

  if not found then
    raise exception 'Workflow execution version % is not recorded for this Run', v_continuation_execution_version;
  end if;
  if workspace.jsonb_sha256_v1(v_exec_version.definition_snapshot) <> v_continuation_hash
    or v_exec_version.definition_snapshot is distinct from (v_run.fields->'run_definition_snapshot') then
    raise exception 'Workflow execution definition snapshot is inconsistent with its identity';
  end if;

  -- Continuation status must be 'ready': a run with a completed step that has
  -- no receipt is 'legacy_partial' and must fail closed, never transition.
  if exists (
    select 1
    from jsonb_each_text(coalesce(v_run.fields->'run_step_states', '{}'::jsonb)) s
    where s.value = 'completed'
      and not exists (
        select 1
        from workspace.workflow_step_result_receipts r
        where r.workflow_run_id = p_workflow_run_id
          and r.step_id = s.key
      )
  ) then
    raise exception 'Workflow continuation status is not ready: completed steps lack receipts';
  end if;

  -- A non-completing transition must carry a JSON-null stepResult; the
  -- completing transition may carry a real result or a JSON null.
  if p_next_step_id = p_expected_step_id and p_next_step_state = 'completed' then
    v_step_result := v_continuation->'stepResult';
  else
    if jsonb_typeof(v_continuation->'stepResult') <> 'null' then
      raise exception 'Non-completing transition requires a JSON-null stepResult';
    end if;
  end if;

  v_current_step := v_run.fields->>'run_current_step_id';
  if v_current_step is distinct from p_expected_step_id then
    raise exception 'Workflow step mismatch: expected %, current %',
      p_expected_step_id,
      v_current_step;
  end if;

  v_states := coalesce(v_run.fields->'run_step_states', '{}'::jsonb);
  if jsonb_typeof(v_states) <> 'object' then
    raise exception 'run_step_states must be a JSON object';
  end if;
  v_current_state := v_states->>p_expected_step_id;
  if v_current_state is distinct from p_expected_step_state then
    raise exception 'Workflow step state mismatch: expected %, current %',
      p_expected_step_state,
      v_current_state;
  end if;

  if v_run.fields->>'run_dispatcher_session' is distinct from p_dispatcher_session::text
    or coalesce((v_run.fields->>'run_fencing_token')::bigint, -1) <> p_fencing_token
  then
    raise exception 'Stale dispatcher lease';
  end if;
  if nullif(v_run.fields->>'run_lease_expires_at', '')::timestamptz <= clock_timestamp() then
    raise exception 'Dispatcher lease expired';
  end if;

  if p_next_step_id = p_expected_step_id then
    if not (
      (p_expected_step_state = 'queued' and p_next_step_state in ('running', 'blocked', 'cancelled'))
      or (p_expected_step_state = 'running' and p_next_step_state in (
        'awaiting_input',
        'suspended',
        'completed',
        'failed',
        'cancelled',
        'abandoned',
        'blocked'
      ))
      or (p_expected_step_state = 'awaiting_input' and p_next_step_state in (
        'running',
        'cancelled',
        'abandoned',
        'blocked'
      ))
      or (p_expected_step_state = 'suspended' and p_next_step_state in (
        'running',
        'cancelled',
        'abandoned',
        'blocked'
      ))
      or (p_expected_step_state = 'blocked' and p_next_step_state in ('queued', 'cancelled'))
    ) then
      raise exception 'Illegal workflow state edge % -> %',
        p_expected_step_state,
        p_next_step_state;
    end if;
  elsif p_expected_step_state <> 'completed' or p_next_step_state <> 'queued' then
    raise exception 'Advancing steps requires completed -> queued';
  end if;

  v_approvals := coalesce(v_run.fields->'run_approvals', '{}'::jsonb);
  if jsonb_typeof(v_approvals) <> 'object' then
    raise exception 'run_approvals must be a JSON object';
  end if;

  if p_approval_mutation is not null then
    if jsonb_typeof(p_approval_mutation) <> 'object' then
      raise exception 'Approval mutation must be a JSON object';
    end if;
    v_operation := p_approval_mutation->>'operation';
    v_approval_id := p_approval_mutation->>'approvalId';
    if nullif(v_operation, '') is null or nullif(v_approval_id, '') is null then
      raise exception 'Approval mutation requires operation and approvalId';
    end if;

    if v_operation = 'request' then
      v_approval := p_approval_mutation->'approval';
      if jsonb_typeof(v_approval) <> 'object'
        or v_approval->>'approvalId' is distinct from v_approval_id
        or v_approval->>'runId' is distinct from p_workflow_run_id::text
        or nullif(v_approval->>'payloadHash', '') is null
        or v_approval->>'payloadHash' !~ '^[a-f0-9]{64}$'
      then
        raise exception 'Invalid approval request object';
      end if;
      v_approvals := jsonb_set(v_approvals, array[v_approval_id], v_approval, true);
    elsif v_operation = 'decide' then
      v_approval := v_approvals->v_approval_id;
      if v_approval is null then
        raise exception 'Approval % not found', v_approval_id;
      end if;
      if p_approval_mutation->>'payloadHash' is distinct from v_approval->>'payloadHash' then
        raise exception 'Approval payload hash mismatch';
      end if;
      if p_approval_mutation->>'decision' not in ('approved', 'denied', 'changes_requested')
        or nullif(p_approval_mutation->>'decisionMaker', '') is null
      then
        raise exception 'Approval decision requires decision and decisionMaker';
      end if;
      v_approval := v_approval || jsonb_build_object(
        'decision', p_approval_mutation->>'decision',
        'decisionMaker', p_approval_mutation->>'decisionMaker',
        'decidedAt', clock_timestamp()
      );
      v_approvals := jsonb_set(v_approvals, array[v_approval_id], v_approval, true);
    elsif v_operation = 'payload_changed' then
      v_approval := v_approvals->v_approval_id;
      if v_approval is null then
        raise exception 'Approval % not found', v_approval_id;
      end if;
      if nullif(p_approval_mutation->>'payloadHash', '') is null
        or p_approval_mutation->>'payloadHash' !~ '^[a-f0-9]{64}$'
      then
        raise exception 'Payload change requires a SHA-256 payload hash';
      end if;
      if p_approval_mutation->>'payloadHash' is distinct from v_approval->>'payloadHash' then
        v_approval := v_approval || jsonb_build_object(
          'successorPayloadHash', p_approval_mutation->>'payloadHash',
          'invalidatedAt', clock_timestamp(),
          'invalidationReason',
          coalesce(
            nullif(p_approval_mutation->>'invalidationReason', ''),
            'Approved payload changed'
          )
        );
        v_approvals := jsonb_set(v_approvals, array[v_approval_id], v_approval, true);
      end if;
    else
      raise exception 'Unsupported approval mutation operation %', v_operation;
    end if;
  end if;

  v_states := jsonb_set(
    v_states,
    array[p_next_step_id],
    to_jsonb(p_next_step_state),
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
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(fields, '{run_version}', to_jsonb(v_next_version), true),
            '{run_current_step_id}',
            to_jsonb(p_next_step_id),
            true
          ),
          '{run_step_states}',
          v_states,
          true
        ),
        '{run_approvals}',
        v_approvals,
        true
      ),
      '{run_status}',
      to_jsonb(p_next_run_status),
      true
    ),
    body = concat_ws(E'\n\n', nullif(rtrim(body), ''), v_section),
    updated_at = now()
  where id = p_workflow_run_id
  returning * into v_run;

  if nullif(p_event_payload->>'assignmentId', '') is not null then
    begin
      v_assignment_id := (p_event_payload->>'assignmentId')::uuid;
    exception
      when invalid_text_representation then
        raise exception 'assignmentId must be a UUID';
    end;
  end if;
  v_runtime_session_id := nullif(p_event_payload->>'runtimeSessionId', '');
  v_event.id := gen_random_uuid();

  -- Step-completion receipt (same-step transition into completed), written
  -- before the transition event so the event id is known and no append-only
  -- row is ever updated.
  if p_next_step_id = p_expected_step_id and p_next_step_state = 'completed' then
    v_receipt_id := gen_random_uuid();
    v_completion_ordinal := (
      select coalesce(max(completion_ordinal), 0) + 1
      from workspace.workflow_step_result_receipts
      where workflow_run_id = p_workflow_run_id
        and execution_version = v_continuation_execution_version
        and step_id = p_next_step_id
    );
    v_result_hash := workspace.jsonb_sha256_v1(coalesce(v_step_result, 'null'::jsonb));
    insert into workspace.workflow_step_result_receipts (
      receipt_id, workflow_run_id, execution_version, definition_hash,
      step_id, completion_ordinal, expected_run_version, resulting_run_version,
      result, result_hash, transition_event_id, actor
    ) values (
      v_receipt_id, p_workflow_run_id, v_continuation_execution_version, v_continuation_hash,
      p_next_step_id, v_completion_ordinal, p_expected_run_version, v_next_version,
      coalesce(v_step_result, 'null'::jsonb), v_result_hash, v_event.id, p_actor
    );
    v_receipt_projection := jsonb_build_object(
      'schema', 'intellizen.workflow-step-result/1',
      'receiptId', v_receipt_id,
      'workflowRunId', p_workflow_run_id,
      'executionVersion', v_continuation_execution_version,
      'definitionHash', v_continuation_hash,
      'stepId', p_next_step_id,
      'completionOrdinal', v_completion_ordinal,
      'expectedRunVersion', p_expected_run_version,
      'resultingRunVersion', v_next_version,
      'result', coalesce(v_step_result, 'null'::jsonb),
      'resultHash', v_result_hash,
      'eventId', v_event.id,
      'actor', p_actor
    );
  end if;

  -- Terminal completion: one deterministic summary receipt + event.
  if p_next_run_status = 'Done' then
    select jsonb_agg(
      jsonb_build_object(
        'stepId', r.step_id,
        'title', coalesce(d.step_title, r.step_id),
        'executionVersion', r.execution_version,
        'completionOrdinal', r.completion_ordinal,
        'resultHash', r.result_hash,
        'result', r.result
      ) order by r.resulting_run_version, r.receipt_id
    )
    into v_summary_steps
    from workspace.workflow_step_result_receipts r
    left join lateral (
      select step->>'title' as step_title
      from jsonb_array_elements(v_exec_version.definition_snapshot->'steps') step
      where step->>'id' = r.step_id
      limit 1
    ) d on true
    where r.workflow_run_id = p_workflow_run_id
      and r.execution_version = v_continuation_execution_version;

    select coalesce(jsonb_agg(step_id order by first_run_version), '[]'::jsonb)
    into v_completed_step_ids
    from (
      select step_id, min(resulting_run_version) as first_run_version
      from workspace.workflow_step_result_receipts
      where workflow_run_id = p_workflow_run_id
        and execution_version = v_continuation_execution_version
      group by step_id
    ) completed;

    v_summary := jsonb_build_object(
      'schema', 'intellizen.workflow-completion-summary/1',
      'workflowRunId', p_workflow_run_id::text,
      'executionVersion', v_continuation_execution_version,
      'definitionHash', v_continuation_hash,
      'completionRunVersion', v_next_version,
      'status', 'Done',
      'steps', coalesce(v_summary_steps, '[]'::jsonb),
      'nowTrue', jsonb_build_object(
        'runStatus', 'Done',
        'currentStepId', p_next_step_id,
        'completedStepIds', v_completed_step_ids
      )
    );
    v_summary_hash := workspace.jsonb_sha256_v1(v_summary);
    v_summary_event_id := gen_random_uuid();

    insert into workspace.workflow_run_completion_receipts (
      receipt_id, workflow_run_id, execution_version, definition_hash,
      completion_run_version, summary, summary_hash, summary_event_id
    ) values (
      gen_random_uuid(), p_workflow_run_id, v_continuation_execution_version, v_continuation_hash,
      v_next_version, v_summary, v_summary_hash, v_summary_event_id
    ) returning * into v_completion;

    -- Deterministic terminal markers on the Run itself.
    update workspace.records
    set fields = fields
      || jsonb_build_object(
        'run_completed_at', to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        'run_receipt', substring(v_summary_hash from 1 for 12)
      ),
      updated_at = now()
    where id = p_workflow_run_id;
  end if;

  v_result := jsonb_build_object(
    'applied', true,
    'duplicate', false,
    'run_version', v_next_version,
    'fencing_token', p_fencing_token,
    'execution_version', v_continuation_execution_version,
    'definition_hash', v_continuation_hash,
    'run', to_jsonb(v_run)
  );

  if p_next_step_id = p_expected_step_id and p_next_step_state = 'completed' then
    v_result := v_result || jsonb_build_object('step_result_receipt', v_receipt_projection);
  else
    v_result := v_result || jsonb_build_object('step_result_receipt', 'null'::jsonb);
  end if;
  if p_next_run_status = 'Done' then
    v_result := v_result || jsonb_build_object('completion', to_jsonb(v_completion));
  else
    v_result := v_result || jsonb_build_object('completion', 'null'::jsonb);
  end if;

  insert into workspace.work_events (
    id,
    record_id,
    workflow_run_id,
    event_kind,
    actor,
    summary,
    payload,
    idempotency_key,
    request_hash,
    run_version,
    step_id,
    assignment_id,
    runtime_session_id
  )
  values (
    v_event.id,
    p_workflow_run_id,
    p_workflow_run_id,
    p_event_kind,
    p_actor,
    p_event_summary,
    coalesce(p_event_payload, '{}'::jsonb) || jsonb_build_object('_rpc_result', v_result),
    p_idempotency_key,
    p_request_hash,
    v_next_version,
    p_next_step_id,
    v_assignment_id,
    v_runtime_session_id
  )
  returning * into v_event;

  if p_next_run_status = 'Done' then
    insert into workspace.work_events (
      id, record_id, workflow_run_id, event_kind, actor, summary, payload,
      idempotency_key, request_hash, run_version, step_id
    ) values (
      v_summary_event_id, p_workflow_run_id, p_workflow_run_id, 'workflow_completion_summarized',
      p_actor, 'Workflow completion summarized',
      jsonb_build_object('summaryHash', v_summary_hash, 'summary', v_summary),
      p_idempotency_key || ':completion', p_request_hash, v_next_version, p_next_step_id
    );
  end if;

  return v_result || jsonb_build_object('event', to_jsonb(v_event));
end;
$function$
\endif
-- END HOSTED TRANSITION SNAPSHOT
