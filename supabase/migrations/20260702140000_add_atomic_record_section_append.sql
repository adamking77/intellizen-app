-- Atomic body-section append for workspace.records.
-- Replaces client-side read-modify-write of the whole body, which loses
-- concurrent agent receipts (last write wins). The append happens inside a
-- single UPDATE so concurrent appends serialize instead of clobbering.
create or replace function workspace.append_record_section(
  p_record_id uuid,
  p_section text,
  p_fields_patch jsonb default null
)
returns workspace.records
language plpgsql
security invoker
as $$
declare
  result workspace.records;
begin
  if p_section is null or length(trim(p_section)) = 0 then
    raise exception 'append_record_section requires a non-empty section';
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

  return result;
end;
$$;

grant execute on function workspace.append_record_section(uuid, text, jsonb) to service_role;
