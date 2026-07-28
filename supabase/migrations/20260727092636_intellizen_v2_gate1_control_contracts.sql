-- IntelliZen V2 Gate 1: organization records and transactional workflow controls.
-- Remote-applied version: 20260727092636
-- Local filename matches the exact remote migration version applied on 2026-07-27.
--
-- Additive only. Apply after dry-run review, explicit approval, a production
-- preflight, and with immediate post-application contract verification.

-- ---------------------------------------------------------------------------
-- Human-visible organization databases
-- ---------------------------------------------------------------------------

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
  'c1000000-0000-0000-0000-000000000003',
  'Roles',
  'intel-system:roles',
  $json$
  [
    {"id":"role_key","name":"Role Key","type":"text"},
    {"id":"role_name","name":"Name","type":"text"},
    {"id":"role_mandate","name":"Mandate","type":"text"},
    {"id":"role_reports_to","name":"Reports To","type":"relation","relation":{"targetDatabaseId":"c1000000-0000-0000-0000-000000000003"}},
    {"id":"role_authority_ceiling","name":"Authority Ceiling","type":"select","options":["read-only","draft-only","local-write","room-write","external-action-request"]},
    {"id":"role_delegation_policy","name":"Delegation Policy","type":"select","options":["leaf-worker","coordinator"]},
    {"id":"role_owner_gate","name":"Owner Gate","type":"select","options":["owner-only","operator-managed","allowlist","disabled"]},
    {"id":"role_verification_eligible","name":"Verification Eligible","type":"checkbox"},
    {"id":"role_status","name":"Status","type":"status","options":["active","retired"]}
  ]
  $json$::jsonb,
  '["role_name","role_authority_ceiling","role_status"]'::jsonb,
  '{"area":"operations","entity":"genzen","object_type":"roles","system_kind":"roles"}'::jsonb,
  'genzen'
),
(
  'c1000000-0000-0000-0000-000000000004',
  'Agents',
  'intel-system:agents',
  $json$
  [
    {"id":"agent_key","name":"Agent Key","type":"text"},
    {"id":"agent_display_name","name":"Display Name","type":"text"},
    {"id":"agent_identity","name":"Identity","type":"text"},
    {"id":"agent_status","name":"Status","type":"status","options":["active","paused","retired"]}
  ]
  $json$::jsonb,
  '["agent_display_name","agent_status"]'::jsonb,
  '{"area":"operations","entity":"genzen","object_type":"agents","system_kind":"agents"}'::jsonb,
  'genzen'
),
(
  'c1000000-0000-0000-0000-000000000005',
  'Role Assignments',
  'intel-system:role-assignments',
  $json$
  [
    {"id":"role_assignment_role","name":"Role","type":"relation","relation":{"targetDatabaseId":"c1000000-0000-0000-0000-000000000003"}},
    {"id":"role_assignment_agent","name":"Agent","type":"relation","relation":{"targetDatabaseId":"c1000000-0000-0000-0000-000000000004"}},
    {"id":"role_assignment_binding_ref","name":"Binding Ref","type":"text"},
    {"id":"role_assignment_scope","name":"Scope","type":"text"},
    {"id":"role_assignment_status","name":"Status","type":"status","options":["active","suspended"]}
  ]
  $json$::jsonb,
  '["role_assignment_role","role_assignment_agent","role_assignment_status"]'::jsonb,
  '{"area":"operations","entity":"genzen","object_type":"role_assignments","system_kind":"role_assignments"}'::jsonb,
  'genzen'
)
on conflict (id) do nothing;

-- Extend the two existing workflow databases without replacing human-managed
-- schema configuration or reordering existing fields.
update workspace.databases as database
set schema = database.schema || coalesce(
  (
    select jsonb_agg(proposed.field order by proposed.ordinality)
    from jsonb_array_elements(
      $json$
      [
        {"id":"workflow_definition","name":"Definition","type":"text"},
        {"id":"workflow_definition_version","name":"Definition Version","type":"number"}
      ]
      $json$::jsonb
    ) with ordinality as proposed(field, ordinality)
    where not exists (
      select 1
      from jsonb_array_elements(database.schema) as existing(field)
      where existing.field->>'id' = proposed.field->>'id'
    )
  ),
  '[]'::jsonb
),
updated_at = now()
where database.id = 'c1000000-0000-0000-0000-000000000001';

update workspace.databases as database
set schema = database.schema || coalesce(
  (
    select jsonb_agg(proposed.field order by proposed.ordinality)
    from jsonb_array_elements(
      $json$
      [
        {"id":"run_schema_version","name":"Schema Version","type":"text"},
        {"id":"run_definition_snapshot","name":"Definition Snapshot","type":"text"},
        {"id":"run_current_step_id","name":"Current Step ID","type":"text"}
      ]
      $json$::jsonb
    ) with ordinality as proposed(field, ordinality)
    where not exists (
      select 1
      from jsonb_array_elements(database.schema) as existing(field)
      where existing.field->>'id' = proposed.field->>'id'
    )
  ),
  '[]'::jsonb
),
updated_at = now()
where database.id = 'c1000000-0000-0000-0000-000000000002';

-- ---------------------------------------------------------------------------
-- Locked proof-fence seed records
-- ---------------------------------------------------------------------------

insert into workspace.records (id, database_id, fields, body, taxonomy, entity)
values
(
  'c1100000-0000-0000-0000-000000000001',
  'c1000000-0000-0000-0000-000000000003',
  '{
    "role_key":"operations_director",
    "role_name":"Operations Director",
    "role_mandate":"Coordinates GenZen operations. May delegate bounded work. External human-visible actions remain founder-approved.",
    "role_reports_to":["c1100000-0000-0000-0000-000000000004"],
    "role_authority_ceiling":"room-write",
    "role_delegation_policy":"coordinator",
    "role_owner_gate":"operator-managed",
    "role_verification_eligible":false,
    "role_status":"active"
  }'::jsonb,
  '# Operations Director',
  '{"entity":"genzen","area":"operations","object_type":"role"}'::jsonb,
  'genzen'
),
(
  'c1100000-0000-0000-0000-000000000002',
  'c1000000-0000-0000-0000-000000000003',
  '{
    "role_key":"chief_engineer",
    "role_name":"Chief Engineer",
    "role_mandate":"Builds and verifies approved technical scope. Cannot expand mission, permissions, or external authority.",
    "role_reports_to":["c1100000-0000-0000-0000-000000000004"],
    "role_authority_ceiling":"local-write",
    "role_delegation_policy":"leaf-worker",
    "role_owner_gate":"allowlist",
    "role_verification_eligible":false,
    "role_status":"active"
  }'::jsonb,
  '# Chief Engineer',
  '{"entity":"genzen","area":"engineering","object_type":"role"}'::jsonb,
  'genzen'
),
(
  'c1100000-0000-0000-0000-000000000003',
  'c1000000-0000-0000-0000-000000000003',
  '{
    "role_key":"verifier",
    "role_name":"Verifier",
    "role_mandate":"Checks defined evidence independently of the producing assignment. Runtime completion is never verification.",
    "role_reports_to":["c1100000-0000-0000-0000-000000000004"],
    "role_authority_ceiling":"read-only",
    "role_delegation_policy":"leaf-worker",
    "role_owner_gate":"allowlist",
    "role_verification_eligible":true,
    "role_status":"active"
  }'::jsonb,
  '# Verifier',
  '{"entity":"genzen","area":"quality","object_type":"role"}'::jsonb,
  'genzen'
),
(
  'c1100000-0000-0000-0000-000000000004',
  'c1000000-0000-0000-0000-000000000003',
  '{
    "role_key":"founder_approval_authority",
    "role_name":"Founder Approval Authority",
    "role_mandate":"Adam alone approves external human-visible actions, roster activation, and other owner-gated decisions.",
    "role_reports_to":[],
    "role_authority_ceiling":"external-action-request",
    "role_delegation_policy":"leaf-worker",
    "role_owner_gate":"owner-only",
    "role_verification_eligible":false,
    "role_status":"active"
  }'::jsonb,
  '# Founder Approval Authority',
  '{"entity":"genzen","area":"governance","object_type":"role"}'::jsonb,
  'genzen'
),
(
  'c1200000-0000-0000-0000-000000000001',
  'c1000000-0000-0000-0000-000000000004',
  '{
    "agent_key":"fiona",
    "agent_display_name":"Fiona",
    "agent_identity":"GenZen Operations Director and durable workflow operator.",
    "agent_status":"active"
  }'::jsonb,
  '# Fiona',
  '{"entity":"genzen","area":"operations","object_type":"agent"}'::jsonb,
  'genzen'
),
(
  'c1200000-0000-0000-0000-000000000002',
  'c1000000-0000-0000-0000-000000000004',
  '{
    "agent_key":"keel",
    "agent_display_name":"Keel",
    "agent_identity":"GenZen Chief Engineer and systems steward.",
    "agent_status":"active"
  }'::jsonb,
  '# Keel',
  '{"entity":"genzen","area":"engineering","object_type":"agent"}'::jsonb,
  'genzen'
),
(
  'c1200000-0000-0000-0000-000000000003',
  'c1000000-0000-0000-0000-000000000004',
  '{
    "agent_key":"adam",
    "agent_display_name":"Adam",
    "agent_identity":"Founder and final human authority.",
    "agent_status":"active"
  }'::jsonb,
  '# Adam',
  '{"entity":"genzen","area":"governance","object_type":"human"}'::jsonb,
  'genzen'
),
(
  'c1300000-0000-0000-0000-000000000001',
  'c1000000-0000-0000-0000-000000000005',
  '{
    "role_assignment_role":["c1100000-0000-0000-0000-000000000001"],
    "role_assignment_agent":["c1200000-0000-0000-0000-000000000001"],
    "role_assignment_binding_ref":null,
    "role_assignment_scope":"GenZen operations",
    "role_assignment_status":"active"
  }'::jsonb,
  '# Operations Director → Fiona',
  '{"entity":"genzen","area":"operations","object_type":"role_assignment"}'::jsonb,
  'genzen'
),
(
  'c1300000-0000-0000-0000-000000000002',
  'c1000000-0000-0000-0000-000000000005',
  '{
    "role_assignment_role":["c1100000-0000-0000-0000-000000000002"],
    "role_assignment_agent":["c1200000-0000-0000-0000-000000000002"],
    "role_assignment_binding_ref":"codex-local-primary",
    "role_assignment_scope":"Approved IntelliZen engineering assignments",
    "role_assignment_status":"active"
  }'::jsonb,
  '# Chief Engineer → Keel',
  '{"entity":"genzen","area":"engineering","object_type":"role_assignment"}'::jsonb,
  'genzen'
),
(
  'c1300000-0000-0000-0000-000000000003',
  'c1000000-0000-0000-0000-000000000005',
  '{
    "role_assignment_role":["c1100000-0000-0000-0000-000000000004"],
    "role_assignment_agent":["c1200000-0000-0000-0000-000000000003"],
    "role_assignment_binding_ref":null,
    "role_assignment_scope":"Human approval only",
    "role_assignment_status":"active"
  }'::jsonb,
  '# Founder Approval Authority → Adam',
  '{"entity":"genzen","area":"governance","object_type":"role_assignment"}'::jsonb,
  'genzen'
)
on conflict (id) do nothing;

-- JSON-backed organization records still receive database-enforced uniqueness
-- and shape fences. Admin-plane actors remain able to bypass MCP policy through
-- direct database access, but they cannot create two active occupants.
create unique index if not exists workspace_roles_role_key_unique
  on workspace.records ((fields->>'role_key'))
  where database_id = 'c1000000-0000-0000-0000-000000000003'
    and nullif(fields->>'role_key', '') is not null;

create unique index if not exists workspace_agents_agent_key_unique
  on workspace.records ((fields->>'agent_key'))
  where database_id = 'c1000000-0000-0000-0000-000000000004'
    and nullif(fields->>'agent_key', '') is not null;

create unique index if not exists workspace_role_assignments_active_role_unique
  on workspace.records ((fields->'role_assignment_role'->>0))
  where database_id = 'c1000000-0000-0000-0000-000000000005'
    and fields->>'role_assignment_status' = 'active';

create unique index if not exists workspace_role_assignments_active_pair_unique
  on workspace.records (
    (fields->'role_assignment_role'->>0),
    (fields->'role_assignment_agent'->>0)
  )
  where database_id = 'c1000000-0000-0000-0000-000000000005'
    and fields->>'role_assignment_status' = 'active';

alter table workspace.records
  add constraint workspace_v2_roles_shape
  check (
    database_id <> 'c1000000-0000-0000-0000-000000000003'
    or (
      nullif(fields->>'role_key', '') is not null
      and fields->>'role_status' in ('active', 'retired')
      and fields->>'role_authority_ceiling' in (
        'read-only',
        'draft-only',
        'local-write',
        'room-write',
        'external-action-request'
      )
    )
  ) not valid;

alter table workspace.records validate constraint workspace_v2_roles_shape;

alter table workspace.records
  add constraint workspace_v2_agents_shape
  check (
    database_id <> 'c1000000-0000-0000-0000-000000000004'
    or (
      nullif(fields->>'agent_key', '') is not null
      and fields->>'agent_status' in ('active', 'paused', 'retired')
    )
  ) not valid;

alter table workspace.records validate constraint workspace_v2_agents_shape;

alter table workspace.records
  add constraint workspace_v2_role_assignments_shape
  check (
    database_id <> 'c1000000-0000-0000-0000-000000000005'
    or (
      jsonb_typeof(fields->'role_assignment_role') = 'array'
      and jsonb_array_length(fields->'role_assignment_role') = 1
      and jsonb_typeof(fields->'role_assignment_agent') = 'array'
      and jsonb_array_length(fields->'role_assignment_agent') = 1
      and fields->>'role_assignment_status' in ('active', 'suspended')
    )
  ) not valid;

alter table workspace.records validate constraint workspace_v2_role_assignments_shape;

-- ---------------------------------------------------------------------------
-- Append-only proof-kernel receipt fields
-- ---------------------------------------------------------------------------

alter table workspace.work_events
  add column if not exists idempotency_key text,
  add column if not exists request_hash text,
  add column if not exists run_version bigint,
  add column if not exists step_id text,
  add column if not exists assignment_id uuid,
  add column if not exists runtime_session_id text;

alter table workspace.work_events
  add constraint workspace_work_events_request_hash_shape
  check (
    request_hash is null
    or request_hash ~ '^[a-f0-9]{64}$'
  ) not valid;

alter table workspace.work_events
  validate constraint workspace_work_events_request_hash_shape;

create unique index if not exists workspace_work_events_run_idempotency_unique
  on workspace.work_events (workflow_run_id, idempotency_key)
  where workflow_run_id is not null
    and idempotency_key is not null;

create index if not exists workspace_work_events_assignment_created_idx
  on workspace.work_events (assignment_id, created_at desc)
  where assignment_id is not null;

create index if not exists workspace_work_events_runtime_session_created_idx
  on workspace.work_events (runtime_session_id, created_at desc)
  where runtime_session_id is not null;

-- ---------------------------------------------------------------------------
-- Fenced dispatcher lease RPC family
-- ---------------------------------------------------------------------------

create or replace function workspace.acquire_workflow_dispatch_lease(
  p_workflow_run_id uuid,
  p_expected_run_version bigint,
  p_dispatcher_session uuid,
  p_lease_ttl_seconds integer,
  p_idempotency_key text,
  p_request_hash text,
  p_actor text
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
  v_next_token bigint;
  v_expires_at timestamptz;
  v_existing_session text;
  v_existing_expiry timestamptz;
  v_section text;
  v_result jsonb;
begin
  if p_expected_run_version < 0
    or p_idempotency_key is null
    or btrim(p_idempotency_key) = ''
    or p_actor is null
    or btrim(p_actor) = ''
    or p_request_hash is null
    or p_request_hash !~ '^[a-f0-9]{64}$'
  then
    raise exception 'Lease acquisition requires version, idempotency key, request hash, and actor';
  end if;
  if p_lease_ttl_seconds < 15 or p_lease_ttl_seconds > 300 then
    raise exception 'Lease TTL must be between 15 and 300 seconds';
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

  v_existing_session := nullif(v_run.fields->>'run_dispatcher_session', '');
  v_existing_expiry := nullif(v_run.fields->>'run_lease_expires_at', '')::timestamptz;
  if v_existing_session is not null
    and v_existing_expiry is not null
    and v_existing_expiry > clock_timestamp()
  then
    raise exception 'Workflow Run already has an active dispatcher lease';
  end if;

  v_next_version := v_current_version + 1;
  v_next_token := coalesce((v_run.fields->>'run_fencing_token')::bigint, 0) + 1;
  v_expires_at := clock_timestamp() + make_interval(secs => p_lease_ttl_seconds);
  v_section := format(
    '## Dispatcher Lease Acquired - %s%s%s',
    clock_timestamp(),
    E'\n\n',
    format('Actor: %s%sFencing token: %s', p_actor, E'\n', v_next_token)
  );

  update workspace.records
  set fields = jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(fields, '{run_version}', to_jsonb(v_next_version), true),
          '{run_dispatcher_session}',
          to_jsonb(p_dispatcher_session::text),
          true
        ),
        '{run_fencing_token}',
        to_jsonb(v_next_token),
        true
      ),
      '{run_lease_expires_at}',
      to_jsonb(v_expires_at),
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
    'fencing_token', v_next_token,
    'lease_expires_at', v_expires_at,
    'run', to_jsonb(v_run)
  );

  insert into workspace.work_events (
    record_id,
    workflow_run_id,
    event_kind,
    actor,
    summary,
    payload,
    idempotency_key,
    request_hash,
    run_version,
    step_id
  )
  values (
    p_workflow_run_id,
    p_workflow_run_id,
    'dispatcher_lease_acquired',
    p_actor,
    'Dispatcher lease acquired',
    jsonb_build_object(
      'dispatcherSession', p_dispatcher_session,
      'fencingToken', v_next_token,
      'leaseExpiresAt', v_expires_at,
      '_rpc_result', v_result
    ),
    p_idempotency_key,
    p_request_hash,
    v_next_version,
    v_run.fields->>'run_current_step_id'
  )
  returning * into v_event;

  return v_result || jsonb_build_object('event', to_jsonb(v_event));
end;
$$;

create or replace function workspace.heartbeat_workflow_dispatch_lease(
  p_workflow_run_id uuid,
  p_dispatcher_session uuid,
  p_fencing_token bigint,
  p_lease_ttl_seconds integer
)
returns jsonb
language plpgsql
security invoker
set search_path = workspace, public, extensions, pg_temp
as $$
declare
  v_run workspace.records;
  v_expires_at timestamptz;
begin
  if p_lease_ttl_seconds < 15 or p_lease_ttl_seconds > 300 then
    raise exception 'Lease TTL must be between 15 and 300 seconds';
  end if;

  select *
  into v_run
  from workspace.records
  where id = p_workflow_run_id
  for update;

  if not found
    or v_run.database_id <> 'c1000000-0000-0000-0000-000000000002'
    or v_run.fields->>'run_schema_version' is distinct from 'intellizen.workflow/1'
  then
    raise exception 'Schema-v1 Workflow Run % not found', p_workflow_run_id;
  end if;
  if v_run.fields->>'run_dispatcher_session' is distinct from p_dispatcher_session::text
    or coalesce((v_run.fields->>'run_fencing_token')::bigint, -1) <> p_fencing_token
  then
    raise exception 'Stale dispatcher lease';
  end if;
  if nullif(v_run.fields->>'run_lease_expires_at', '')::timestamptz <= clock_timestamp() then
    raise exception 'Dispatcher lease expired';
  end if;

  v_expires_at := clock_timestamp() + make_interval(secs => p_lease_ttl_seconds);
  update workspace.records
  set fields = jsonb_set(
      fields,
      '{run_lease_expires_at}',
      to_jsonb(v_expires_at),
      true
    ),
    updated_at = now()
  where id = p_workflow_run_id;

  return jsonb_build_object(
    'applied', true,
    'fencing_token', p_fencing_token,
    'lease_expires_at', v_expires_at
  );
end;
$$;

create or replace function workspace.release_workflow_dispatch_lease(
  p_workflow_run_id uuid,
  p_dispatcher_session uuid,
  p_fencing_token bigint,
  p_actor text,
  p_idempotency_key text,
  p_request_hash text
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
  v_next_version bigint;
  v_result jsonb;
  v_section text;
begin
  if p_actor is null
    or btrim(p_actor) = ''
    or p_idempotency_key is null
    or btrim(p_idempotency_key) = ''
    or p_request_hash is null
    or p_request_hash !~ '^[a-f0-9]{64}$'
  then
    raise exception 'Lease release requires actor, idempotency key, and request hash';
  end if;

  select *
  into v_run
  from workspace.records
  where id = p_workflow_run_id
  for update;

  if not found
    or v_run.database_id <> 'c1000000-0000-0000-0000-000000000002'
    or v_run.fields->>'run_schema_version' is distinct from 'intellizen.workflow/1'
  then
    raise exception 'Schema-v1 Workflow Run % not found', p_workflow_run_id;
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

  if v_run.fields->>'run_dispatcher_session' is distinct from p_dispatcher_session::text
    or coalesce((v_run.fields->>'run_fencing_token')::bigint, -1) <> p_fencing_token
  then
    raise exception 'Stale dispatcher lease';
  end if;
  if nullif(v_run.fields->>'run_lease_expires_at', '')::timestamptz <= clock_timestamp() then
    raise exception 'Dispatcher lease expired';
  end if;

  v_next_version := coalesce((v_run.fields->>'run_version')::bigint, 0) + 1;
  v_section := format(
    '## Dispatcher Lease Released - %s%s%s',
    clock_timestamp(),
    E'\n\n',
    format('Actor: %s%sFencing token: %s', p_actor, E'\n', p_fencing_token)
  );

  update workspace.records
  set fields = jsonb_set(
      (fields - 'run_dispatcher_session' - 'run_lease_expires_at'),
      '{run_version}',
      to_jsonb(v_next_version),
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

  insert into workspace.work_events (
    record_id,
    workflow_run_id,
    event_kind,
    actor,
    summary,
    payload,
    idempotency_key,
    request_hash,
    run_version,
    step_id
  )
  values (
    p_workflow_run_id,
    p_workflow_run_id,
    'dispatcher_lease_released',
    p_actor,
    'Dispatcher lease released',
    jsonb_build_object(
      'dispatcherSession', p_dispatcher_session,
      'fencingToken', p_fencing_token,
      '_rpc_result', v_result
    ),
    p_idempotency_key,
    p_request_hash,
    v_next_version,
    v_run.fields->>'run_current_step_id'
  )
  returning * into v_event;

  return v_result || jsonb_build_object('event', to_jsonb(v_event));
end;
$$;

-- ---------------------------------------------------------------------------
-- Transactional compare-and-set workflow transition + mandatory receipt
-- ---------------------------------------------------------------------------

create or replace function workspace.transition_workflow_step(
  p_workflow_run_id uuid,
  p_expected_run_version bigint,
  p_expected_step_id text,
  p_expected_step_state text,
  p_next_step_id text,
  p_next_step_state text,
  p_next_run_status text,
  p_dispatcher_session uuid,
  p_fencing_token bigint,
  p_idempotency_key text,
  p_request_hash text,
  p_actor text,
  p_event_kind text,
  p_event_summary text,
  p_event_payload jsonb default '{}'::jsonb,
  p_approval_mutation jsonb default null
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
begin
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
          'payloadHash', p_approval_mutation->>'payloadHash',
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
    exception
      when invalid_text_representation then
        raise exception 'assignmentId must be a UUID';
    end;
  end if;
  v_runtime_session_id := nullif(p_event_payload->>'runtimeSessionId', '');

  insert into workspace.work_events (
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

  return v_result || jsonb_build_object('event', to_jsonb(v_event));
end;
$$;

revoke all on function workspace.acquire_workflow_dispatch_lease(
  uuid,
  bigint,
  uuid,
  integer,
  text,
  text,
  text
) from public, authenticated;
grant execute on function workspace.acquire_workflow_dispatch_lease(
  uuid,
  bigint,
  uuid,
  integer,
  text,
  text,
  text
) to anon, service_role;

revoke all on function workspace.heartbeat_workflow_dispatch_lease(
  uuid,
  uuid,
  bigint,
  integer
) from public, authenticated;
grant execute on function workspace.heartbeat_workflow_dispatch_lease(
  uuid,
  uuid,
  bigint,
  integer
) to anon, service_role;

revoke all on function workspace.release_workflow_dispatch_lease(
  uuid,
  uuid,
  bigint,
  text,
  text,
  text
) from public, authenticated;
grant execute on function workspace.release_workflow_dispatch_lease(
  uuid,
  uuid,
  bigint,
  text,
  text,
  text
) to anon, service_role;

revoke all on function workspace.transition_workflow_step(
  uuid,
  bigint,
  text,
  text,
  text,
  text,
  text,
  uuid,
  bigint,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  jsonb
) from public, authenticated;
grant execute on function workspace.transition_workflow_step(
  uuid,
  bigint,
  text,
  text,
  text,
  text,
  text,
  uuid,
  bigint,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  jsonb
) to anon, service_role;
