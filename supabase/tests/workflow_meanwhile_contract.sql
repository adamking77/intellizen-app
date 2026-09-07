-- Run only after applying 20260907180000 to a local/test database.
-- The transaction always rolls back.

begin;

insert into workspace.records (id, database_id, fields, body, taxonomy, entity)
values (
  'f6000000-0000-4000-8000-000000000001',
  'c1000000-0000-0000-0000-000000000002',
  jsonb_build_object(
    'run_name', 'Meanwhile RPC fixture',
    'run_status', 'Needs approval',
    'run_schema_version', 'intellizen.workflow/1',
    'run_definition_snapshot', jsonb_build_object(
      'schema', 'intellizen.workflow/1',
      'id', 'test.meanwhile',
      'version', 1,
      'name', 'Meanwhile test',
      'steps', jsonb_build_array(
        jsonb_build_object(
          'id', 'approve', 'kind', 'approval', 'title', 'Approve',
          'gate', 'founder_approval_authority',
          'payloadRef', 'steps.prepare.result',
          'meanwhile', jsonb_build_array('research'),
          'next', 'after'
        ),
        jsonb_build_object(
          'id', 'research', 'kind', 'role-assign', 'title', 'Research',
          'role', 'researcher', 'instructions', 'Read only',
          'execution', 'ephemeral', 'resolution', 'active-role-occupant',
          'timeoutMinutes', 5, 'mediatedAuthority', 'read-only',
          'verification', jsonb_build_object('required', false),
          'next', null
        ),
        jsonb_build_object(
          'id', 'rogue', 'kind', 'role-assign', 'title', 'Rogue',
          'role', 'researcher', 'instructions', 'Read only',
          'execution', 'ephemeral', 'resolution', 'active-role-occupant',
          'timeoutMinutes', 5, 'mediatedAuthority', 'read-only',
          'verification', jsonb_build_object('required', false),
          'next', null
        ),
        jsonb_build_object(
          'id', 'after', 'kind', 'condition', 'title', 'After',
          'expr', 'steps.prepare.state == ''completed''',
          'then', 'complete', 'else', 'blocked'
        )
      )
    ),
    'run_current_step_id', 'approve',
    'run_version', 0,
    'run_step_states', jsonb_build_object(
      'prepare', 'queued', 'approve', 'running',
      'research', 'queued', 'rogue', 'queued', 'after', 'queued'
    ),
    'run_fencing_token', 0,
    'run_approvals', jsonb_build_object(
      'f6000000-0000-4000-8000-000000000010',
      jsonb_build_object(
        'approvalId', 'f6000000-0000-4000-8000-000000000010',
        'runId', 'f6000000-0000-4000-8000-000000000001',
        'stepId', 'approve',
        'payloadHash', repeat('a', 64),
        'requiredRole', 'founder_approval_authority',
        'decision', null
      )
    )
  ),
  '# Meanwhile RPC fixture',
  '{"object_type":"workflow_run_test"}'::jsonb,
  'genzen'
);

insert into workspace.records (id, database_id, fields, body, taxonomy, entity)
select
  'f6000000-0000-4000-8000-000000000011',
  database_id,
  fields || jsonb_build_object(
    'run_name', 'Meanwhile denial fixture',
    'run_current_step_id', 'approve',
    'run_status', 'Needs approval',
    'run_version', 0,
    'run_step_states', jsonb_build_object(
      'prepare', 'queued', 'approve', 'running',
      'research', 'queued', 'rogue', 'queued', 'after', 'queued'
    ),
    'run_fencing_token', 0,
    'run_approvals', jsonb_build_object(
      'f6000000-0000-4000-8000-000000000012',
      jsonb_build_object(
        'approvalId', 'f6000000-0000-4000-8000-000000000012',
        'runId', 'f6000000-0000-4000-8000-000000000011',
        'stepId', 'approve', 'payloadHash', repeat('b', 64),
        'requiredRole', 'founder_approval_authority', 'decision', null
      )
    )
  ),
  '# Meanwhile denial fixture', taxonomy, entity
from workspace.records
where id = 'f6000000-0000-4000-8000-000000000001';

insert into workspace.records (id, database_id, fields, body, taxonomy, entity)
select
  'f6000000-0000-4000-8000-000000000031', database_id,
  fields || jsonb_build_object(
    'run_name', 'Meanwhile anon fixture',
    'run_current_step_id', 'approve',
    'run_status', 'Needs approval',
    'run_version', 0,
    'run_step_states', jsonb_build_object(
      'prepare', 'queued', 'approve', 'running',
      'research', 'queued', 'rogue', 'queued', 'after', 'queued'
    ),
    'run_fencing_token', 0,
    'run_approvals', '{}'::jsonb
  ),
  '# Meanwhile anon fixture', taxonomy, entity
from workspace.records
where id = 'f6000000-0000-4000-8000-000000000001';

update workspace.records
set fields = fields || jsonb_build_object(
  'run_execution_version', 1,
  'run_definition_hash', workspace.jsonb_sha256_v1(
    (fields->>'run_definition_snapshot')::jsonb
  )
)
where id in (
  'f6000000-0000-4000-8000-000000000001',
  'f6000000-0000-4000-8000-000000000011',
  'f6000000-0000-4000-8000-000000000031'
);

insert into workspace.workflow_run_execution_versions (
  workflow_run_id, execution_version, definition_version, definition_hash,
  definition_snapshot, activation_kind, actor
)
select id, 1, 1, fields->>'run_definition_hash',
  (fields->>'run_definition_snapshot')::jsonb, 'manual_start', 'MeanwhileTest'
from workspace.records
where id in (
  'f6000000-0000-4000-8000-000000000001',
  'f6000000-0000-4000-8000-000000000011',
  'f6000000-0000-4000-8000-000000000031'
);

do $$
begin
  if has_table_privilege(
    'anon', 'workspace.workflow_step_result_receipts', 'select'
  ) or exists (
    select 1 from pg_policy
    where polrelid = 'workspace.workflow_step_result_receipts'::regclass
  ) then
    raise exception 'Anon receipt-ledger reads must remain ungranted and unpolicied';
  end if;
  if not has_function_privilege(
    'anon', 'workspace.get_workflow_run_continuation_v1(uuid)', 'execute'
  ) then
    raise exception 'Anon needs the guarded continuation reader';
  end if;
end;
$$;

set local role anon;

do $$
declare
  caught boolean := false;
begin
  begin
    perform 1 from workspace.workflow_step_result_receipts limit 1;
  exception when insufficient_privilege then
    caught := true;
  end;
  if not caught then
    raise exception 'Anon directly read the protected receipt ledger';
  end if;
end;
$$;

do $$
declare
  result jsonb;
  caught boolean := false;
begin
  result := workspace.acquire_workflow_dispatch_lease(
    'f6000000-0000-4000-8000-000000000031', 0,
    'f6000000-0000-4000-8000-000000000032', 60,
    'meanwhile:anon:lease', repeat('1', 64), 'MeanwhileAnon'
  );
  result := workspace.transition_workflow_side_step(
    'f6000000-0000-4000-8000-000000000031', 1,
    'approve', 'running', 'research', 'queued', 'running',
    'f6000000-0000-4000-8000-000000000032', 1,
    'meanwhile:anon:claim', repeat('2', 64), 'Researcher',
    'meanwhile_assignment_created', 'Anon research claimed',
    jsonb_build_object('assignmentId', 'f6000000-0000-4000-8000-000000000033')
  );
  result := workspace.release_workflow_dispatch_lease(
    'f6000000-0000-4000-8000-000000000031',
    'f6000000-0000-4000-8000-000000000032', 1, 'MeanwhileAnon',
    'meanwhile:anon:release', repeat('3', 64)
  );

  perform set_config('request.headers', '{}'::jsonb::text, true);
  begin
    perform workspace.settle_workflow_side_step(
      'f6000000-0000-4000-8000-000000000031',
      'approve', 'research', 'running', 'completed',
      'f6000000-0000-4000-8000-000000000033',
      'meanwhile:anon:settle', repeat('4', 64), 'Researcher',
      'meanwhile_completed', 'Anon research completed'
    );
  exception when others then
    caught := position('Local access authority is required' in sqlerrm) > 0;
  end;
  if not caught then raise exception 'Missing local access header was accepted'; end if;

  caught := false;
  perform set_config(
    'request.headers',
    jsonb_build_object('x-intellizen-local-access', repeat('y', 32))::text,
    true
  );
  begin
    perform workspace.settle_workflow_side_step(
      'f6000000-0000-4000-8000-000000000031',
      'approve', 'research', 'running', 'completed',
      'f6000000-0000-4000-8000-000000000033',
      'meanwhile:anon:settle', repeat('4', 64), 'Researcher',
      'meanwhile_completed', 'Anon research completed'
    );
  exception when others then
    caught := position('Local access authority is required' in sqlerrm) > 0;
  end;
  if not caught then raise exception 'Wrong local access header was accepted'; end if;

  perform set_config(
    'request.headers',
    jsonb_build_object('x-intellizen-local-access', repeat('x', 32))::text,
    true
  );
  result := workspace.settle_workflow_side_step(
    'f6000000-0000-4000-8000-000000000031',
    'approve', 'research', 'running', 'completed',
    'f6000000-0000-4000-8000-000000000033',
    'meanwhile:anon:settle', repeat('4', 64), 'Researcher',
    'meanwhile_completed', 'Anon research completed',
    jsonb_build_object(
      'assignmentId', 'f6000000-0000-4000-8000-000000000033',
      'result', jsonb_build_object('status', 'completed')
    )
  );
  if result#>>'{step_result_receipt,stepId}' <> 'research'
    or result#>>'{step_result_receipt,eventId}' is null then
    raise exception 'Authorized anon settlement did not return its ledger receipt';
  end if;
end;
$$;

reset role;

do $$
begin
  if not exists (
    select 1
    from workspace.workflow_step_result_receipts r
    join workspace.work_events e on e.id = r.transition_event_id
    where r.workflow_run_id = 'f6000000-0000-4000-8000-000000000031'
      and r.step_id = 'research'
      and e.assignment_id = 'f6000000-0000-4000-8000-000000000033'
  ) then
    raise exception 'Authorized anon settlement receipt is not linked to its event';
  end if;
end;
$$;

do $$
declare
  caught boolean := false;
begin
  begin
    perform workspace.transition_workflow_side_step(
      'f6000000-0000-4000-8000-000000000011', null,
      'approve', 'running', 'research', 'queued', 'running',
      'f6000000-0000-4000-8000-000000000013', 1,
      'meanwhile:test:null-version', null, 'Researcher',
      'meanwhile_assignment_created', 'Invalid claim'
    );
  exception when others then
    caught := position('requires CAS' in sqlerrm) > 0;
  end;
  if not caught then raise exception 'Null CAS inputs did not fail closed'; end if;
end;
$$;

do $$
declare
  result jsonb;
  caught boolean := false;
begin
  result := workspace.acquire_workflow_dispatch_lease(
    'f6000000-0000-4000-8000-000000000001', 0,
    'f6000000-0000-4000-8000-000000000002', 60,
    'meanwhile:test:lease', repeat('1', 64), 'MeanwhileTest'
  );
  if result->>'run_version' <> '1' then
    raise exception 'Lease did not advance the run';
  end if;

  result := workspace.transition_workflow_side_step(
    'f6000000-0000-4000-8000-000000000001', 1,
    'approve', 'running', 'research', 'queued', 'running',
    'f6000000-0000-4000-8000-000000000002', 1,
    'meanwhile:test:claim', repeat('2', 64), 'Researcher',
    'meanwhile_assignment_created', 'Research claimed',
    jsonb_build_object(
      'assignmentId', 'f6000000-0000-4000-8000-000000000003',
      'assignment', jsonb_build_object('selectedAgent', 'Researcher')
    )
  );
  if result->>'run_version' <> '2'
    or result#>>'{run,fields,run_current_step_id}' <> 'approve'
    or result#>>'{run,fields,run_status}' <> 'Needs approval'
  then
    raise exception 'Side claim changed the approval cursor or status';
  end if;

  result := workspace.transition_workflow_side_step(
    'f6000000-0000-4000-8000-000000000001', 1,
    'approve', 'running', 'research', 'queued', 'running',
    'f6000000-0000-4000-8000-000000000002', 1,
    'meanwhile:test:claim', repeat('2', 64), 'Researcher',
    'meanwhile_assignment_created', 'Research claimed',
    jsonb_build_object(
      'assignmentId', 'f6000000-0000-4000-8000-000000000003',
      'assignment', jsonb_build_object('selectedAgent', 'Researcher')
    )
  );
  if result->>'duplicate' <> 'true' then
    raise exception 'Side claim replay was not deduplicated';
  end if;
  begin
    perform workspace.transition_workflow_side_step(
      'f6000000-0000-4000-8000-000000000001', 1,
      'approve', 'running', 'research', 'queued', 'running',
      'f6000000-0000-4000-8000-000000000002', 1,
      'meanwhile:test:claim', repeat('9', 64), 'Researcher',
      'meanwhile_assignment_created', 'Research claimed',
      jsonb_build_object(
        'assignmentId', 'f6000000-0000-4000-8000-000000000003',
        'assignment', jsonb_build_object('selectedAgent', 'Researcher')
      )
    );
  exception when others then
    caught := position('different request hash' in sqlerrm) > 0;
  end;
  if not caught then raise exception 'Side claim key accepted a different request hash'; end if;
end;
$$;

do $$
declare
  result jsonb;
  caught boolean := false;
  original_snapshot jsonb;
  original_hash text;
  rotated_snapshot jsonb;
  rotated_hash text;
begin
  result := workspace.acquire_workflow_dispatch_lease(
    'f6000000-0000-4000-8000-000000000011', 0,
    'f6000000-0000-4000-8000-000000000013', 60,
    'meanwhile:deny:lease', repeat('8', 64), 'MeanwhileTest'
  );
  update workspace.records
  set fields = jsonb_set(fields, '{run_lease_expires_at}', to_jsonb((now() - interval '1 minute')::text), true)
  where id = 'f6000000-0000-4000-8000-000000000011';
  begin
    perform workspace.transition_workflow_side_step(
      'f6000000-0000-4000-8000-000000000011', 1,
      'approve', 'running', 'research', 'queued', 'running',
      'f6000000-0000-4000-8000-000000000013', 1,
      'meanwhile:deny:expired', repeat('9', 64), 'Researcher',
      'meanwhile_assignment_created', 'Expired lease claim',
      jsonb_build_object('assignmentId', 'f6000000-0000-4000-8000-000000000014')
    );
  exception when others then
    caught := position('lease expired' in sqlerrm) > 0;
  end;
  if not caught then raise exception 'Expired side claim lease did not fail closed'; end if;
  update workspace.records
  set fields = jsonb_set(fields, '{run_lease_expires_at}', to_jsonb((now() + interval '1 minute')::text), true)
  where id = 'f6000000-0000-4000-8000-000000000011';

  caught := false;
  begin
    perform workspace.transition_workflow_side_step(
      'f6000000-0000-4000-8000-000000000011', 1,
      'approve', 'running', 'research', 'queued', 'running',
      'f6000000-0000-4000-8000-000000000013', null,
      'meanwhile:deny:null-fence', repeat('e', 64), 'Researcher',
      'meanwhile_assignment_created', 'Null fence claim',
      jsonb_build_object('assignmentId', 'f6000000-0000-4000-8000-000000000014')
    );
  exception when others then
    caught := position('requires CAS' in sqlerrm) > 0;
  end;
  if not caught then raise exception 'Null fencing token did not fail closed'; end if;

  caught := false;
  begin
    perform workspace.transition_workflow_side_step(
      'f6000000-0000-4000-8000-000000000011', 1,
      'approve', 'running', 'rogue', 'queued', 'running',
      'f6000000-0000-4000-8000-000000000013', 1,
      'meanwhile:deny:undeclared', repeat('f', 64), 'Researcher',
      'meanwhile_assignment_created', 'Undeclared side claim',
      jsonb_build_object('assignmentId', 'f6000000-0000-4000-8000-000000000015')
    );
  exception when others then
    caught := position('not declared' in sqlerrm) > 0;
  end;
  if not caught then raise exception 'Undeclared side step was accepted'; end if;

  result := workspace.transition_workflow_side_step(
    'f6000000-0000-4000-8000-000000000011', 1,
    'approve', 'running', 'research', 'queued', 'running',
    'f6000000-0000-4000-8000-000000000013', 1,
    'meanwhile:deny:claim', repeat('a', 64), 'Researcher',
    'meanwhile_assignment_created', 'Research claimed before denial',
    jsonb_build_object('assignmentId', 'f6000000-0000-4000-8000-000000000014')
  );
  result := workspace.transition_workflow_step(
    'f6000000-0000-4000-8000-000000000011', 2,
    'approve', 'running', 'approve', 'blocked', 'Blocked',
    'f6000000-0000-4000-8000-000000000013', 1,
    'meanwhile:deny:decision', repeat('b', 64), 'Adam',
    'approval_denied', 'Exact payload denied',
    jsonb_build_object(
      'approvalId', 'f6000000-0000-4000-8000-000000000012',
      '_continuation', jsonb_build_object(
        'schema', 'intellizen.workflow-transition-continuation/1',
        'executionVersion', 1,
        'definitionHash', (
          select fields->>'run_definition_hash' from workspace.records
          where id = 'f6000000-0000-4000-8000-000000000011'
        ),
        'stepResult', 'null'::jsonb
      )
    ),
    jsonb_build_object(
      'operation', 'decide',
      'approvalId', 'f6000000-0000-4000-8000-000000000012',
      'payloadHash', repeat('b', 64), 'decision', 'denied',
      'decisionMaker', 'Adam'
    )
  );
  result := workspace.release_workflow_dispatch_lease(
    'f6000000-0000-4000-8000-000000000011',
    'f6000000-0000-4000-8000-000000000013', 1, 'MeanwhileTest',
    'meanwhile:deny:release', repeat('c', 64)
  );
  caught := false;
  begin
    perform workspace.settle_workflow_side_step(
      'f6000000-0000-4000-8000-000000000011',
      'approve', 'research', 'running', 'completed',
      'f6000000-0000-4000-8000-000000000099',
      'meanwhile:deny:wrong-assignment', repeat('7', 64), 'Researcher',
      'meanwhile_completed', 'Wrong assignment'
    );
  exception when others then
    caught := position('claim was not found' in sqlerrm) > 0;
  end;
  if not caught then raise exception 'Unclaimed running side settlement was accepted'; end if;

  select fields->'run_definition_snapshot', fields->>'run_definition_hash'
  into original_snapshot, original_hash
  from workspace.records
  where id = 'f6000000-0000-4000-8000-000000000011';
  rotated_snapshot := jsonb_set(
    original_snapshot,
    '{name}',
    '"Meanwhile denial fixture rotated"'::jsonb
  );
  rotated_hash := workspace.jsonb_sha256_v1(rotated_snapshot);
  insert into workspace.workflow_run_execution_versions (
    workflow_run_id, execution_version, definition_version, definition_hash,
    definition_snapshot, activation_kind, actor
  ) values (
    'f6000000-0000-4000-8000-000000000011', 2, 1, rotated_hash,
    rotated_snapshot, 'live_edit', 'MeanwhileTest'
  );
  update workspace.records
  set fields = fields || jsonb_build_object(
    'run_execution_version', 2,
    'run_definition_hash', rotated_hash,
    'run_definition_snapshot', rotated_snapshot
  )
  where id = 'f6000000-0000-4000-8000-000000000011';
  caught := false;
  begin
    perform workspace.settle_workflow_side_step(
      'f6000000-0000-4000-8000-000000000011',
      'approve', 'research', 'running', 'completed',
      'f6000000-0000-4000-8000-000000000014',
      'meanwhile:deny:cross-execution', repeat('6', 64), 'Researcher',
      'meanwhile_completed', 'Old execution settlement'
    );
  exception when others then
    caught := position('claim was not found' in sqlerrm) > 0;
  end;
  if not caught then
    raise exception 'A claim from an older execution was allowed to settle';
  end if;
  update workspace.records
  set fields = fields || jsonb_build_object(
    'run_execution_version', 1,
    'run_definition_hash', original_hash,
    'run_definition_snapshot', original_snapshot
  )
  where id = 'f6000000-0000-4000-8000-000000000011';

  result := workspace.settle_workflow_side_step(
    'f6000000-0000-4000-8000-000000000011',
    'approve', 'research', 'running', 'completed',
    'f6000000-0000-4000-8000-000000000014',
    'meanwhile:deny:settle', repeat('d', 64), 'Researcher',
    'meanwhile_completed', 'Research completed after denial',
    jsonb_build_object('assignmentId', 'f6000000-0000-4000-8000-000000000014')
  );
  if result#>>'{run,fields,run_current_step_id}' <> 'approve'
    or result#>>'{run,fields,run_status}' <> 'Blocked'
    or result#>>'{run,fields,run_step_states,approve}' <> 'blocked'
    or result#>>'{run,fields,run_step_states,research}' <> 'completed'
  then
    raise exception 'Settlement after denial changed the denied main state';
  end if;
  if workspace.get_workflow_run_continuation_v1(
    'f6000000-0000-4000-8000-000000000011'
  )->>'continuationStatus' <> 'ready' then
    raise exception 'Settlement after denial left an incomplete continuation ledger';
  end if;
end;
$$;

do $$
declare
  result jsonb;
  caught boolean := false;
begin
  begin
    perform workspace.settle_workflow_side_step(
      'f6000000-0000-4000-8000-000000000001',
      'approve', 'research', 'running', 'completed',
      'f6000000-0000-4000-8000-000000000003',
      'meanwhile:test:settle-during-main', repeat('0', 64), 'Researcher',
      'meanwhile_completed', 'Settlement raced main lease'
    );
  exception when others then
    caught := position('waits for active dispatcher lease' in sqlerrm) > 0;
  end;
  if not caught then
    raise exception 'Side settlement advanced version during the main dispatcher lease';
  end if;

  result := workspace.transition_workflow_step(
    'f6000000-0000-4000-8000-000000000001', 2,
    'approve', 'running', 'approve', 'completed', 'In progress',
    'f6000000-0000-4000-8000-000000000002', 1,
    'meanwhile:test:approved', repeat('3', 64), 'Adam',
    'approval_granted', 'Exact payload approved',
    jsonb_build_object(
      'approvalId', 'f6000000-0000-4000-8000-000000000010',
      '_continuation', jsonb_build_object(
        'schema', 'intellizen.workflow-transition-continuation/1',
        'executionVersion', 1,
        'definitionHash', (
          select fields->>'run_definition_hash' from workspace.records
          where id = 'f6000000-0000-4000-8000-000000000001'
        ),
        'stepResult', 'null'::jsonb
      )
    ),
    jsonb_build_object(
      'operation', 'decide',
      'approvalId', 'f6000000-0000-4000-8000-000000000010',
      'payloadHash', repeat('a', 64),
      'decision', 'approved',
      'decisionMaker', 'Adam'
    )
  );
  if result#>>'{step_result_receipt,stepId}' <> 'approve'
    or result#>>'{step_result_receipt,eventId}' <> result#>>'{event,id}'
    or workspace.get_workflow_run_continuation_v1(
      'f6000000-0000-4000-8000-000000000001'
    )->>'continuationStatus' <> 'ready' then
    raise exception 'Hosted main transition did not atomically create its approval receipt';
  end if;
  result := workspace.transition_workflow_step(
    'f6000000-0000-4000-8000-000000000001', 3,
    'approve', 'completed', 'after', 'queued', 'In progress',
    'f6000000-0000-4000-8000-000000000002', 1,
    'meanwhile:test:advance', repeat('4', 64), 'Adam',
    'workflow_step_advanced', 'Approval advanced',
    jsonb_build_object(
      '_continuation', jsonb_build_object(
        'schema', 'intellizen.workflow-transition-continuation/1',
        'executionVersion', 1,
        'definitionHash', (
          select fields->>'run_definition_hash' from workspace.records
          where id = 'f6000000-0000-4000-8000-000000000001'
        ),
        'stepResult', 'null'::jsonb
      )
    ),
    null
  );
  result := workspace.release_workflow_dispatch_lease(
    'f6000000-0000-4000-8000-000000000001',
    'f6000000-0000-4000-8000-000000000002', 1, 'MeanwhileTest',
    'meanwhile:test:release', repeat('5', 64)
  );
  if result->>'run_version' <> '5' then
    raise exception 'Approval advance and release did not reach version 5';
  end if;
  if (select count(*) from workspace.work_events
      where workflow_run_id = 'f6000000-0000-4000-8000-000000000001'
        and event_kind = 'workflow_step_advanced') <> 1
  then
    raise exception 'Main approval cursor did not advance exactly once';
  end if;
end;
$$;

do $$
declare
  result jsonb;
begin
  result := workspace.settle_workflow_side_step(
    'f6000000-0000-4000-8000-000000000001',
    'approve', 'research', 'running', 'completed',
    'f6000000-0000-4000-8000-000000000003',
    'meanwhile:test:settle', repeat('6', 64), 'Researcher',
    'meanwhile_completed', 'Research completed after approval advanced',
    jsonb_build_object(
      'assignmentId', 'f6000000-0000-4000-8000-000000000003',
      'runtimeSessionId', 'session-1',
      'result', jsonb_build_object('status', 'completed')
    )
  );
  if result->>'run_version' <> '6'
    or result#>>'{run,fields,run_current_step_id}' <> 'after'
    or result#>>'{run,fields,run_status}' <> 'In progress'
    or result#>>'{run,fields,run_step_states,research}' <> 'completed'
  then
    raise exception 'Late side settlement lost the main cursor or status';
  end if;
  if result#>>'{step_result_receipt,stepId}' <> 'research'
    or result#>>'{step_result_receipt,result,status}' <> 'completed'
    or (
      select count(*) from workspace.workflow_step_result_receipts
      where workflow_run_id = 'f6000000-0000-4000-8000-000000000001'
        and step_id = 'research'
    ) <> 1
    or (
      select contract_version from workspace.work_events
      where workflow_run_id = 'f6000000-0000-4000-8000-000000000001'
        and event_kind = 'meanwhile_completed'
    ) <> 1
    or workspace.get_workflow_run_continuation_v1(
      'f6000000-0000-4000-8000-000000000001'
    )->>'continuationStatus' <> 'ready'
  then
    raise exception 'Side completion did not preserve a ready immutable continuation';
  end if;

  result := workspace.acquire_workflow_dispatch_lease(
    'f6000000-0000-4000-8000-000000000001', 6,
    'f6000000-0000-4000-8000-000000000020', 60,
    'meanwhile:test:later-main-lease', repeat('1', 64), 'MeanwhileTest'
  );

  result := workspace.settle_workflow_side_step(
    'f6000000-0000-4000-8000-000000000001',
    'approve', 'research', 'running', 'completed',
    'f6000000-0000-4000-8000-000000000003',
    'meanwhile:test:settle', repeat('6', 64), 'Researcher',
    'meanwhile_completed', 'Research completed after approval advanced',
    jsonb_build_object(
      'assignmentId', 'f6000000-0000-4000-8000-000000000003',
      'runtimeSessionId', 'session-1',
      'result', jsonb_build_object('status', 'completed')
    )
  );
  if result->>'duplicate' <> 'true' then
    raise exception 'Side settlement replay was not deduplicated during a later main lease';
  end if;
  result := workspace.release_workflow_dispatch_lease(
    'f6000000-0000-4000-8000-000000000001',
    'f6000000-0000-4000-8000-000000000020', 2, 'MeanwhileTest',
    'meanwhile:test:later-main-release', repeat('2', 64)
  );
end;
$$;

rollback;
