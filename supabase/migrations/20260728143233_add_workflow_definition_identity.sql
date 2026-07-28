-- Every executable run carries the validated canonical hash of its immutable
-- definition snapshot. This extends the generic database schema only; it does
-- not rewrite historical runs or infer an identity for legacy snapshots.
update workspace.databases as database
set schema = database.schema || coalesce(
  (
    select jsonb_agg(proposed.field order by proposed.ordinality)
    from jsonb_array_elements(
      '[{"id":"run_definition_hash","name":"Definition Hash","type":"text"}]'::jsonb
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
