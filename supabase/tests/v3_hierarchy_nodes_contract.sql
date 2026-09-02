-- Hierarchy tree contract: legacy filing and parent rules.
-- Run only after applying 20260901000045 to a local/test database.

begin;

do $$
declare
  v_count bigint;
  v_op_a bigint;
  v_op_b bigint;
  v_p1 bigint;
  v_p2 bigint;
  v_p3 bigint;
  v_i1 bigint;
  v_i4 bigint;
  v_i5 bigint;
  v_dept uuid;
  v_ws_b uuid;
  v_unfiled uuid;
  v_p1_node uuid;
  v_p2_node uuid;
  v_failed boolean;
begin
  insert into anchors.operations (name) values ('Op A') returning id into v_op_a;
  insert into anchors.operations (name) values ('Op B') returning id into v_op_b;
  insert into anchors.projects (name, type, operation_id) values ('P1', 'client_case', v_op_a) returning id into v_p1;
  insert into anchors.projects (name, type, operation_id) values ('P2', 'research', v_op_a) returning id into v_p2;
  insert into anchors.projects (name, type, operation_id) values ('P3', 'report', null) returning id into v_p3;
  insert into intel.investigations (case_id, name, project_id) values ('case-t-001', 'I1', v_p1) returning id into v_i1;
  insert into intel.investigations (case_id, name, project_id) values ('case-t-002', 'I2', v_p2);
  insert into intel.investigations (case_id, name, project_id) values ('case-t-003', 'I3', v_p2);
  insert into intel.investigations (case_id, name, project_id, operation_id) values ('case-t-004', 'I4', null, v_op_b) returning id into v_i4;
  insert into intel.investigations (case_id, name, project_id, operation_id) values ('case-t-005', 'I5', null, null) returning id into v_i5;

  perform workspace.file_legacy_hierarchy();
  perform workspace.file_legacy_hierarchy();

  select count(*) into v_count from workspace.hierarchy_nodes where kind = 'department';
  if v_count <> 1 then
    raise exception 'expected one department, got %', v_count;
  end if;
  select id into v_dept from workspace.hierarchy_nodes where kind = 'department';

  select count(*) into v_count from workspace.hierarchy_nodes where kind = 'workspace';
  if v_count <> 3 then
    raise exception 'expected 3 workspaces (Op A, Op B, Unfiled), got %', v_count;
  end if;
  select count(*) into v_count from workspace.hierarchy_nodes where kind = 'workspace' and parent_id <> v_dept;
  if v_count <> 0 then
    raise exception 'every workspace sits under the department';
  end if;
  select id into v_ws_b from workspace.hierarchy_nodes where legacy_operation_id = v_op_b;
  select id into v_unfiled from workspace.hierarchy_nodes where kind = 'workspace' and name = 'Unfiled';

  select count(*) into v_count from workspace.hierarchy_nodes where kind = 'project';
  if v_count <> 7 then
    raise exception 'expected 7 projects (P1, P2, P3, I2, I3, I4, I5), got %', v_count;
  end if;

  select id into v_p1_node from workspace.hierarchy_nodes where legacy_project_id = v_p1;
  if (select legacy_investigation_id from workspace.hierarchy_nodes where id = v_p1_node) <> v_i1 then
    raise exception 'a project with exactly one investigation carries its id';
  end if;

  select id into v_p2_node from workspace.hierarchy_nodes where legacy_project_id = v_p2;
  if (select legacy_investigation_id from workspace.hierarchy_nodes where id = v_p2_node) is not null then
    raise exception 'a project with several investigations is not stamped itself';
  end if;
  select count(*) into v_count
  from workspace.hierarchy_nodes
  where parent_id = v_p2_node and kind = 'project' and legacy_investigation_id is not null;
  if v_count <> 2 then
    raise exception 'expected 2 child projects under P2, got %', v_count;
  end if;

  if (select parent_id from workspace.hierarchy_nodes where legacy_project_id = v_p3) <> v_unfiled then
    raise exception 'a project without an operation goes to Unfiled';
  end if;
  if (select parent_id from workspace.hierarchy_nodes where legacy_investigation_id = v_i4) <> v_ws_b then
    raise exception 'an investigation without a project goes under its operation';
  end if;
  if (select parent_id from workspace.hierarchy_nodes where legacy_investigation_id = v_i5) <> v_unfiled then
    raise exception 'an investigation without a project or operation goes to Unfiled';
  end if;

  select count(*) into v_count
  from workspace.hierarchy_nodes n
  join workspace.hierarchy_nodes p on p.id = n.parent_id
  where n.kind = 'project' and p.kind not in ('workspace', 'project');
  if v_count <> 0 then
    raise exception 'every project sits under a workspace or a project';
  end if;

  select count(*) into v_count
  from (
    select 1 from anchors.operations o
    where not exists (select 1 from workspace.hierarchy_nodes h where h.legacy_operation_id = o.id)
    union all
    select 1 from anchors.projects x
    where not exists (select 1 from workspace.hierarchy_nodes h where h.legacy_project_id = x.id)
    union all
    select 1 from intel.investigations i
    where not exists (select 1 from workspace.hierarchy_nodes h where h.legacy_investigation_id = i.id)
  ) missing;
  if v_count <> 0 then
    raise exception '% legacy rows are not filed', v_count;
  end if;

  v_failed := false;
  begin
    insert into workspace.hierarchy_nodes (kind, parent_id, name) values ('workspace', v_p1_node, 'bad');
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'a workspace under a project must be rejected';
  end if;

  v_failed := false;
  begin
    insert into workspace.hierarchy_nodes (kind, parent_id, name) values ('project', v_dept, 'bad');
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'a project under a department must be rejected';
  end if;

  v_failed := false;
  begin
    insert into workspace.hierarchy_nodes (kind, parent_id, name) values ('department', v_dept, 'bad');
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'a department with a parent must be rejected';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'workspace' and tablename = 'hierarchy_nodes'
      and policyname = 'personal_app_local_access' and 'anon' = any(roles)
  ) then
    raise exception 'hierarchy_nodes is missing the personal app policy';
  end if;
end;
$$;

rollback;
