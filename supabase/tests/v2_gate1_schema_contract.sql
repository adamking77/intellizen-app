-- Gate 1 schema, seed, index, and RPC-authority verification.
-- Run only after applying 20260727092636 to a local/test database.

begin;

do $$
declare
  v_count bigint;
  v_function regprocedure;
  v_function_name text;
  v_required_functions regprocedure[] := array[
    'workspace.acquire_workflow_dispatch_lease(uuid,bigint,uuid,integer,text,text,text)'::regprocedure,
    'workspace.heartbeat_workflow_dispatch_lease(uuid,uuid,bigint,integer)'::regprocedure,
    'workspace.release_workflow_dispatch_lease(uuid,uuid,bigint,text,text,text)'::regprocedure,
    'workspace.transition_workflow_step(uuid,bigint,text,text,text,text,text,uuid,bigint,text,text,text,text,text,jsonb,jsonb)'::regprocedure
  ];
begin
  select count(*)
  into v_count
  from workspace.databases
  where (id, name) in (
    ('c1000000-0000-0000-0000-000000000003'::uuid, 'Roles'),
    ('c1000000-0000-0000-0000-000000000004'::uuid, 'Agents'),
    ('c1000000-0000-0000-0000-000000000005'::uuid, 'Role Assignments')
  );
  if v_count <> 3 then
    raise exception 'Gate 1 control databases are not seeded with the fixed IDs';
  end if;

  select count(*)
  into v_count
  from workspace.records
  where database_id = 'c1000000-0000-0000-0000-000000000003'
    and fields->>'role_key' in (
      'operations_director',
      'chief_engineer',
      'verifier',
      'founder_approval_authority'
    );
  if v_count <> 4 then
    raise exception 'Gate 1 role seed is incomplete';
  end if;

  select count(*)
  into v_count
  from workspace.records
  where database_id = 'c1000000-0000-0000-0000-000000000004'
    and fields->>'agent_key' in ('fiona', 'keel', 'adam');
  if v_count <> 3 then
    raise exception 'Gate 1 agent seed is incomplete';
  end if;

  select count(*)
  into v_count
  from workspace.records
  where database_id = 'c1000000-0000-0000-0000-000000000005'
    and fields->>'role_assignment_status' = 'active';
  if v_count <> 3 then
    raise exception 'Gate 1 standing assignment seed is incomplete';
  end if;

  select count(*)
  into v_count
  from pg_attribute
  where attrelid = 'workspace.work_events'::regclass
    and attname in (
      'idempotency_key',
      'request_hash',
      'run_version',
      'step_id',
      'assignment_id',
      'runtime_session_id'
    )
    and not attisdropped;
  if v_count <> 6 then
    raise exception 'Gate 1 work-event proof columns are incomplete';
  end if;

  if not exists (
    select 1
    from workspace.databases as database,
      jsonb_array_elements(database.schema) as field
    where database.id = 'c1000000-0000-0000-0000-000000000002'
      and field->>'id' = 'run_definition_hash'
      and field->>'type' = 'text'
  ) then
    raise exception 'Workflow Runs schema is missing the definition identity field';
  end if;

  select count(*)
  into v_count
  from pg_indexes
  where schemaname = 'workspace'
    and indexname in (
      'workspace_roles_role_key_unique',
      'workspace_agents_agent_key_unique',
      'workspace_role_assignments_active_role_unique',
      'workspace_role_assignments_active_pair_unique',
      'workspace_work_events_run_idempotency_unique'
    );
  if v_count <> 5 then
    raise exception 'Gate 1 uniqueness indexes are incomplete';
  end if;

  foreach v_function in array v_required_functions loop
    v_function_name := v_function::text;

    if (
      select prosecdef
      from pg_proc
      where oid = v_function::oid
    ) then
      raise exception '% must remain SECURITY INVOKER', v_function_name;
    end if;

    if has_function_privilege('public', v_function, 'EXECUTE')
      or has_function_privilege('authenticated', v_function, 'EXECUTE')
    then
      raise exception '% exposes execute to a disallowed database role', v_function_name;
    end if;

    if not has_function_privilege('anon', v_function, 'EXECUTE')
      or not has_function_privilege('service_role', v_function, 'EXECUTE')
    then
      raise exception '% is missing an intended execute grant', v_function_name;
    end if;
  end loop;
end;
$$;

rollback;
