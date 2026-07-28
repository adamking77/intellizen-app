-- V2 audit receipt authority verification.
-- Run on a local/test database only after applying the two 20260728 receipt
-- migrations. This contract is read-only and always rolls back.

begin;

do $$
declare
  v_function regprocedure;
  v_function_name text;
  v_required_functions regprocedure[] := array[
    'workspace.append_record_section(uuid,text,jsonb)'::regprocedure,
    'workspace.append_record_section_with_event(uuid,text,jsonb,uuid,text,text,text,text,text,jsonb)'::regprocedure
  ];
begin
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

  if has_table_privilege(
    'service_role',
    'workspace.record_revisions',
    'DELETE'
  ) then
    raise exception 'service_role must not delete record revision history';
  end if;
end;
$$;

rollback;
