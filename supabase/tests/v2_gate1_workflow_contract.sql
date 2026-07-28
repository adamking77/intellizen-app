-- Gate 1 transactional RPC verification.
-- Run only after applying 20260727092636 to a local/test database.
-- The transaction always rolls back.

begin;

insert into workspace.records (
  id,
  database_id,
  fields,
  body,
  taxonomy,
  entity
)
values
(
  'f1000000-0000-4000-8000-000000000001',
  'c1000000-0000-0000-0000-000000000002',
  '{
    "run_name":"Gate 1 RPC fixture",
    "run_status":"Queued",
    "run_schema_version":"intellizen.workflow/1",
    "run_definition_snapshot":"{}",
    "run_current_step_id":"s1",
    "run_version":0,
    "run_step_states":{"s1":"queued","s2":"queued"},
    "run_fencing_token":0,
    "run_approvals":{},
    "run_context_evidence":{}
  }'::jsonb,
  '# Gate 1 RPC fixture',
  '{"entity":"genzen","area":"engineering","object_type":"workflow_run_test"}'::jsonb,
  'genzen'
),
(
  'f1000000-0000-4000-8000-000000000002',
  'c1000000-0000-0000-0000-000000000002',
  '{"run_name":"Legacy fixture","run_status":"Queued"}'::jsonb,
  '# Legacy fixture',
  '{"entity":"genzen","area":"engineering","object_type":"workflow_run_test"}'::jsonb,
  'genzen'
),
(
  'f1000000-0000-4000-8000-000000000003',
  'c1000000-0000-0000-0000-000000000001',
  '{"workflow_name":"Not a run","workflow_id":"test.not_run","workflow_status":"Draft"}'::jsonb,
  '# Non-run fixture',
  '{"entity":"genzen","area":"engineering","object_type":"workflow_test"}'::jsonb,
  'genzen'
);

do $$
declare
  result jsonb;
begin
  result := workspace.acquire_workflow_dispatch_lease(
    'f1000000-0000-4000-8000-000000000001',
    0,
    'f2000000-0000-4000-8000-000000000001',
    60,
    'gate1:test:lease:acquire',
    repeat('a', 64),
    'Gate1Test'
  );
  if result->>'run_version' <> '1' or result->>'fencing_token' <> '1' then
    raise exception 'Lease acquisition did not increment version and fencing token';
  end if;

  result := workspace.acquire_workflow_dispatch_lease(
    'f1000000-0000-4000-8000-000000000001',
    0,
    'f2000000-0000-4000-8000-000000000001',
    60,
    'gate1:test:lease:acquire',
    repeat('a', 64),
    'Gate1Test'
  );
  if result->>'duplicate' <> 'true' then
    raise exception 'Identical lease replay did not return duplicate';
  end if;
end;
$$;

do $$
declare
  caught boolean := false;
begin
  begin
    perform workspace.acquire_workflow_dispatch_lease(
      'f1000000-0000-4000-8000-000000000001',
      1,
      'f2000000-0000-4000-8000-000000000002',
      60,
      'gate1:test:lease:takeover',
      repeat('b', 64),
      'Gate1Test'
    );
  exception
    when others then
      caught := position('active dispatcher lease' in sqlerrm) > 0;
  end;
  if not caught then
    raise exception 'Active lease takeover was not rejected';
  end if;
end;
$$;

do $$
declare
  caught boolean := false;
begin
  begin
    perform workspace.transition_workflow_step(
      'f1000000-0000-4000-8000-000000000001',
      99,
      's1',
      'queued',
      's1',
      'running',
      'In progress',
      'f2000000-0000-4000-8000-000000000001',
      1,
      'gate1:test:wrong-version',
      repeat('b', 64),
      'Gate1Test',
      'agent_started',
      'Wrong version fixture'
    );
  exception
    when others then
      caught := position('version mismatch' in sqlerrm) > 0;
  end;
  if not caught then
    raise exception 'Wrong run version was not rejected';
  end if;
end;
$$;

do $$
declare
  caught boolean := false;
begin
  begin
    perform workspace.transition_workflow_step(
      'f1000000-0000-4000-8000-000000000001',
      1,
      'wrong-step',
      'queued',
      'wrong-step',
      'running',
      'In progress',
      'f2000000-0000-4000-8000-000000000001',
      1,
      'gate1:test:wrong-step',
      repeat('c', 64),
      'Gate1Test',
      'agent_started',
      'Wrong step fixture'
    );
  exception
    when others then
      caught := position('step mismatch' in sqlerrm) > 0;
  end;
  if not caught then
    raise exception 'Wrong current step was not rejected';
  end if;
end;
$$;

do $$
declare
  caught boolean := false;
begin
  begin
    perform workspace.transition_workflow_step(
      'f1000000-0000-4000-8000-000000000001',
      1,
      's1',
      'queued',
      's1',
      'completed',
      'Done',
      'f2000000-0000-4000-8000-000000000001',
      1,
      'gate1:test:illegal-edge',
      repeat('d', 64),
      'Gate1Test',
      'agent_completed',
      'Illegal edge fixture'
    );
  exception
    when others then
      caught := position('Illegal workflow state edge' in sqlerrm) > 0;
  end;
  if not caught then
    raise exception 'Illegal state edge was not rejected';
  end if;
end;
$$;

do $$
declare
  caught boolean := false;
begin
  begin
    perform workspace.transition_workflow_step(
      'f1000000-0000-4000-8000-000000000001',
      1,
      's1',
      'queued',
      's1',
      'running',
      'In progress',
      'f2000000-0000-4000-8000-000000000001',
      0,
      'gate1:test:stale-token',
      repeat('e', 64),
      'Gate1Test',
      'agent_started',
      'Stale token fixture'
    );
  exception
    when others then
      caught := position('Stale dispatcher lease' in sqlerrm) > 0;
  end;
  if not caught then
    raise exception 'Stale fencing token was not rejected';
  end if;
end;
$$;

do $$
declare
  caught boolean := false;
  before_version bigint;
  after_version bigint;
begin
  select (fields->>'run_version')::bigint
  into before_version
  from workspace.records
  where id = 'f1000000-0000-4000-8000-000000000001';

  begin
    perform workspace.transition_workflow_step(
      'f1000000-0000-4000-8000-000000000001',
      1,
      's1',
      'queued',
      's1',
      'running',
      'In progress',
      'f2000000-0000-4000-8000-000000000001',
      1,
      'gate1:test:missing-receipt',
      repeat('f', 64),
      'Gate1Test',
      'agent_started',
      ''
    );
  exception
    when others then
      caught := position('requires CAS, receipt' in sqlerrm) > 0;
  end;

  select (fields->>'run_version')::bigint
  into after_version
  from workspace.records
  where id = 'f1000000-0000-4000-8000-000000000001';

  if not caught or before_version <> after_version then
    raise exception 'Missing receipt did not reject and roll back';
  end if;
end;
$$;

do $$
declare
  caught_non_run boolean := false;
  caught_legacy boolean := false;
begin
  begin
    perform workspace.transition_workflow_step(
      'f1000000-0000-4000-8000-000000000003',
      0,
      's1',
      'queued',
      's1',
      'running',
      'In progress',
      'f2000000-0000-4000-8000-000000000001',
      1,
      'gate1:test:not-run',
      repeat('1', 64),
      'Gate1Test',
      'agent_started',
      'Non-run fixture'
    );
  exception
    when others then
      caught_non_run := position('Workflow Run' in sqlerrm) > 0;
  end;

  begin
    perform workspace.transition_workflow_step(
      'f1000000-0000-4000-8000-000000000002',
      0,
      's1',
      'queued',
      's1',
      'running',
      'In progress',
      'f2000000-0000-4000-8000-000000000001',
      1,
      'gate1:test:legacy',
      repeat('2', 64),
      'Gate1Test',
      'agent_started',
      'Legacy fixture'
    );
  exception
    when others then
      caught_legacy := position('not schema v1' in sqlerrm) > 0;
  end;

  if not caught_non_run or not caught_legacy then
    raise exception 'Non-run or legacy record was not rejected (non_run=%, legacy=%)',
      caught_non_run,
      caught_legacy;
  end if;
end;
$$;

do $$
declare
  result jsonb;
  event_count bigint;
begin
  result := workspace.transition_workflow_step(
    'f1000000-0000-4000-8000-000000000001',
    1,
    's1',
    'queued',
    's1',
    'running',
    'In progress',
    'f2000000-0000-4000-8000-000000000001',
    1,
    'gate1:test:transition:start',
    repeat('3', 64),
    'Gate1Test',
    'agent_started',
    'Legal transition',
    '{"assignmentId":"f3000000-0000-4000-8000-000000000001","runtimeSessionId":"fixture-session"}'
  );
  if result->>'run_version' <> '2' or result#>>'{run,fields,run_step_states,s1}' <> 'running' then
    raise exception 'Legal transition did not commit expected state';
  end if;

  result := workspace.transition_workflow_step(
    'f1000000-0000-4000-8000-000000000001',
    1,
    's1',
    'queued',
    's1',
    'running',
    'In progress',
    'f2000000-0000-4000-8000-000000000001',
    1,
    'gate1:test:transition:start',
    repeat('3', 64),
    'Gate1Test',
    'agent_started',
    'Legal transition'
  );
  if result->>'duplicate' <> 'true' then
    raise exception 'Identical transition replay did not return duplicate';
  end if;

  select count(*)
  into event_count
  from workspace.work_events
  where workflow_run_id = 'f1000000-0000-4000-8000-000000000001'
    and idempotency_key = 'gate1:test:transition:start';
  if event_count <> 1 then
    raise exception 'Duplicate transition created a second event';
  end if;
end;
$$;

do $$
declare
  caught boolean := false;
begin
  begin
    perform workspace.transition_workflow_step(
      'f1000000-0000-4000-8000-000000000001',
      2,
      's1',
      'running',
      's1',
      'awaiting_input',
      'Needs approval',
      'f2000000-0000-4000-8000-000000000001',
      1,
      'gate1:test:transition:start',
      repeat('4', 64),
      'Gate1Test',
      'approval_requested',
      'Different request fixture'
    );
  exception
    when others then
      caught := position('different request hash' in sqlerrm) > 0;
  end;
  if not caught then
    raise exception 'Idempotency key reuse with different hash was not rejected';
  end if;
end;
$$;

update workspace.records
set fields = jsonb_set(
  fields,
  '{run_lease_expires_at}',
  to_jsonb(clock_timestamp() - interval '1 second'),
  true
)
where id = 'f1000000-0000-4000-8000-000000000001';

do $$
declare
  caught boolean := false;
begin
  begin
    perform workspace.transition_workflow_step(
      'f1000000-0000-4000-8000-000000000001',
      2,
      's1',
      'running',
      's1',
      'awaiting_input',
      'Needs approval',
      'f2000000-0000-4000-8000-000000000001',
      1,
      'gate1:test:expired',
      repeat('5', 64),
      'Gate1Test',
      'approval_requested',
      'Expired lease fixture'
    );
  exception
    when others then
      caught := position('lease expired' in lower(sqlerrm)) > 0;
  end;
  if not caught then
    raise exception 'Expired lease was not rejected';
  end if;
end;
$$;

update workspace.records
set fields = jsonb_set(
  fields,
  '{run_lease_expires_at}',
  to_jsonb(clock_timestamp() + interval '60 seconds'),
  true
)
where id = 'f1000000-0000-4000-8000-000000000001';

select workspace.transition_workflow_step(
  'f1000000-0000-4000-8000-000000000001',
  2,
  's1',
  'running',
  's1',
  'awaiting_input',
  'Needs approval',
  'f2000000-0000-4000-8000-000000000001',
  1,
  'gate1:test:approval:request',
  repeat('6', 64),
  'Gate1Test',
  'approval_requested',
  'Approval requested',
  '{}'::jsonb,
  jsonb_build_object(
    'operation', 'request',
    'approvalId', 'approval-1',
    'approval', jsonb_build_object(
      'approvalId', 'approval-1',
      'runId', 'f1000000-0000-4000-8000-000000000001',
      'stepId', 's1',
      'approvalType', 'external-action',
      'requiredRole', 'founder_approval_authority',
      'payloadRef', 'steps.s1.result',
      'payloadHash', repeat('a', 64),
      'requester', 'Gate1Test',
      'requestedAt', clock_timestamp(),
      'decision', null,
      'decisionMaker', null,
      'decidedAt', null,
      'invalidatedAt', null,
      'invalidationReason', null
    )
  )
);

select workspace.transition_workflow_step(
  'f1000000-0000-4000-8000-000000000001',
  3,
  's1',
  'awaiting_input',
  's1',
  'running',
  'In progress',
  'f2000000-0000-4000-8000-000000000001',
  1,
  'gate1:test:approval:decide',
  repeat('7', 64),
  'Adam',
  'approval_granted',
  'Approval granted',
  '{}'::jsonb,
  jsonb_build_object(
    'operation', 'decide',
    'approvalId', 'approval-1',
    'payloadHash', repeat('a', 64),
    'decision', 'approved',
    'decisionMaker', 'Adam'
  )
);

select workspace.transition_workflow_step(
  'f1000000-0000-4000-8000-000000000001',
  4,
  's1',
  'running',
  's1',
  'completed',
  'Done',
  'f2000000-0000-4000-8000-000000000001',
  1,
  'gate1:test:approval:invalidate',
  repeat('8', 64),
  'Gate1Test',
  'agent_completed',
  'Payload changed after approval',
  '{}'::jsonb,
  jsonb_build_object(
    'operation', 'payload_changed',
    'approvalId', 'approval-1',
    'payloadHash', repeat('b', 64),
    'invalidationReason', 'Fixture payload changed'
  )
);

do $$
declare
  approval jsonb;
begin
  select fields#>'{run_approvals,approval-1}'
  into approval
  from workspace.records
  where id = 'f1000000-0000-4000-8000-000000000001';

  if approval->>'decision' <> 'approved'
    or nullif(approval->>'invalidatedAt', '') is null
    or approval->>'payloadHash' <> repeat('b', 64)
  then
    raise exception 'Payload mutation did not invalidate approval transactionally';
  end if;
end;
$$;

select workspace.release_workflow_dispatch_lease(
  'f1000000-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000001',
  1,
  'Gate1Test',
  'gate1:test:lease:release',
  repeat('9', 64)
);

do $$
declare
  run_fields jsonb;
  event_count bigint;
begin
  select fields
  into run_fields
  from workspace.records
  where id = 'f1000000-0000-4000-8000-000000000001';

  select count(*)
  into event_count
  from workspace.work_events
  where workflow_run_id = 'f1000000-0000-4000-8000-000000000001';

  if run_fields ? 'run_dispatcher_session'
    or run_fields ? 'run_lease_expires_at'
    or (run_fields->>'run_version')::bigint <> 6
    or event_count <> 6
  then
    raise exception 'Final Gate 1 fixture state or receipt count is incorrect';
  end if;
end;
$$;

rollback;
