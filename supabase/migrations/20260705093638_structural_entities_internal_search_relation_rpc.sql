-- Structural entity layer, generic internal search, and server-side relation reciprocity.
--
-- This is intentionally additive. Existing taxonomy JSON remains for display
-- context, while entity columns become the queryable routing dimension.

create or replace function workspace.normalize_entity_slug(value text)
returns text
language sql
immutable
set search_path = workspace, public, pg_temp
as $$
  select case
    when value is null or btrim(value) = '' then 'genzen'
    when regexp_replace(lower(btrim(value)), '[^a-z0-9]+', '_', 'g') in ('genzen_hq', 'intellizen') then 'genzen'
    when regexp_replace(lower(btrim(value)), '[^a-z0-9]+', '_', 'g') in ('genzen_solutions', 'gzs') then 'genzen_solutions'
    when regexp_replace(lower(btrim(value)), '[^a-z0-9]+', '_', 'g') in ('gokart_studio', 'gokart') then 'gokart_studio'
    when regexp_replace(lower(btrim(value)), '[^a-z0-9]+', '_', 'g') in ('founder_context', 'founder') then 'founder_context'
    when regexp_replace(lower(btrim(value)), '[^a-z0-9]+', '_', 'g') = 'archive' then 'archive'
    else 'genzen'
  end;
$$;

create table if not exists workspace.entities (
  slug text primary key,
  label text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table workspace.entities add column if not exists description text;

insert into workspace.entities (slug, label, status)
values
  ('genzen', 'GenZen', 'active'),
  ('genzen_solutions', 'GenZen Solutions', 'active'),
  ('gokart_studio', 'GoKart Studio', 'active'),
  ('founder_context', 'Founder Context', 'active'),
  ('archive', 'Archive', 'archived')
on conflict (slug) do update
set label = excluded.label,
    status = excluded.status,
    updated_at = now();

alter table workspace.entities enable row level security;
revoke all privileges on workspace.entities from anon, authenticated;
grant select on workspace.entities to anon;
grant select, insert, update, delete on workspace.entities to service_role;
drop policy if exists personal_app_local_access on workspace.entities;
create policy personal_app_local_access
on workspace.entities
for select
to anon
using (system.intellizen_local_access_ok());

alter table workspace.databases add column if not exists entity text;
alter table workspace.records add column if not exists entity text;
alter table anchors.operations add column if not exists entity text;
alter table anchors.projects add column if not exists entity text;
alter table intel.monitors add column if not exists entity text;
alter table intel.signals add column if not exists entity text;
alter table intel.investigations add column if not exists entity text;
alter table knowledge.documents add column if not exists entity text;

update workspace.databases
set entity = workspace.normalize_entity_slug(coalesce(taxonomy->>'entity', entity, 'genzen'))
where entity is null
   or entity <> workspace.normalize_entity_slug(coalesce(taxonomy->>'entity', entity, 'genzen'));

update workspace.records r
set entity = workspace.normalize_entity_slug(coalesce(r.taxonomy->>'entity', d.entity, r.entity, 'genzen'))
from workspace.databases d
where r.database_id = d.id
  and (
    r.entity is null
    or r.entity <> workspace.normalize_entity_slug(coalesce(r.taxonomy->>'entity', d.entity, r.entity, 'genzen'))
  );

update anchors.operations
set entity = workspace.normalize_entity_slug(coalesce(taxonomy->>'entity', entity, 'genzen'))
where entity is null
   or entity <> workspace.normalize_entity_slug(coalesce(taxonomy->>'entity', entity, 'genzen'));

update anchors.projects
set entity = workspace.normalize_entity_slug(coalesce(taxonomy->>'entity', entity, 'genzen'))
where entity is null
   or entity <> workspace.normalize_entity_slug(coalesce(taxonomy->>'entity', entity, 'genzen'));

update intel.monitors
set entity = workspace.normalize_entity_slug(coalesce(entity, 'genzen_solutions'))
where entity is null
   or entity <> workspace.normalize_entity_slug(coalesce(entity, 'genzen_solutions'));

update intel.signals
set entity = workspace.normalize_entity_slug(coalesce(entity, 'genzen_solutions'))
where entity is null
   or entity <> workspace.normalize_entity_slug(coalesce(entity, 'genzen_solutions'));

update intel.investigations
set entity = workspace.normalize_entity_slug(coalesce(taxonomy->>'entity', entity, 'genzen_solutions'))
where entity is null
   or entity <> workspace.normalize_entity_slug(coalesce(taxonomy->>'entity', entity, 'genzen_solutions'));

update knowledge.documents
set entity = workspace.normalize_entity_slug(coalesce(taxonomy->>'entity', entity, 'genzen'))
where entity is null
   or entity <> workspace.normalize_entity_slug(coalesce(taxonomy->>'entity', entity, 'genzen'));

alter table workspace.databases alter column entity set default 'genzen';
alter table workspace.records alter column entity set default 'genzen';
alter table anchors.operations alter column entity set default 'genzen';
alter table anchors.projects alter column entity set default 'genzen';
alter table intel.monitors alter column entity set default 'genzen_solutions';
alter table intel.signals alter column entity set default 'genzen_solutions';
alter table intel.investigations alter column entity set default 'genzen_solutions';
alter table knowledge.documents alter column entity set default 'genzen';

alter table workspace.databases alter column entity set not null;
alter table workspace.records alter column entity set not null;
alter table anchors.operations alter column entity set not null;
alter table anchors.projects alter column entity set not null;
alter table intel.monitors alter column entity set not null;
alter table intel.signals alter column entity set not null;
alter table intel.investigations alter column entity set not null;
alter table knowledge.documents alter column entity set not null;

do $$
declare
  item record;
begin
  for item in
    select *
    from (values
      ('workspace', 'databases', 'workspace_databases_entity_fkey'),
      ('workspace', 'records', 'workspace_records_entity_fkey'),
      ('anchors', 'operations', 'anchors_operations_entity_fkey'),
      ('anchors', 'projects', 'anchors_projects_entity_fkey'),
      ('intel', 'monitors', 'intel_monitors_entity_fkey'),
      ('intel', 'signals', 'intel_signals_entity_fkey'),
      ('intel', 'investigations', 'intel_investigations_entity_fkey'),
      ('knowledge', 'documents', 'knowledge_documents_entity_fkey')
    ) as constraints(schema_name, table_name, constraint_name)
  loop
    if not exists (
      select 1
      from pg_constraint c
      join pg_class rel on rel.oid = c.conrelid
      join pg_namespace nsp on nsp.oid = rel.relnamespace
      where nsp.nspname = item.schema_name
        and rel.relname = item.table_name
        and c.conname = item.constraint_name
    ) then
      execute format(
        'alter table %I.%I add constraint %I foreign key (entity) references workspace.entities(slug) not valid',
        item.schema_name,
        item.table_name,
        item.constraint_name
      );
    end if;
    execute format('alter table %I.%I validate constraint %I', item.schema_name, item.table_name, item.constraint_name);
  end loop;
end;
$$;

create index if not exists workspace_databases_entity_idx on workspace.databases (entity);
create index if not exists workspace_records_entity_idx on workspace.records (entity, updated_at desc);
create index if not exists anchors_operations_entity_idx on anchors.operations (entity);
create index if not exists anchors_projects_entity_idx on anchors.projects (entity);
create index if not exists intel_monitors_entity_idx on intel.monitors (entity);
create index if not exists intel_signals_entity_idx on intel.signals (entity, created_at desc);
create index if not exists intel_investigations_entity_idx on intel.investigations (entity);
create index if not exists knowledge_documents_entity_idx on knowledge.documents (entity, updated_at desc);

-- Normalize free-text workflow entity fields into structural slugs.
update workspace.records
set fields = jsonb_set(
  coalesce(fields, '{}'::jsonb),
  '{workflow_entity}',
  to_jsonb(workspace.normalize_entity_slug(fields->>'workflow_entity')),
  true
)
where database_id = 'c1000000-0000-0000-0000-000000000001';

update workspace.records
set fields = jsonb_set(
  coalesce(fields, '{}'::jsonb),
  '{run_entity_scope}',
  to_jsonb(workspace.normalize_entity_slug(fields->>'run_entity_scope')),
  true
)
where database_id = 'c1000000-0000-0000-0000-000000000002';

create or replace function workspace.update_relation_links(
  p_database_id uuid,
  p_record_id uuid,
  p_relation_field_id text,
  p_record_ids text[]
)
returns workspace.records
language plpgsql
security invoker
set search_path = workspace, public, pg_temp
as $$
declare
  source_field jsonb;
  target_database_id uuid;
  backlink_field_id text;
  source_record workspace.records;
  target_record workspace.records;
  normalized_ids text[];
  current_ids text[];
  affected_ids text[];
  existing_links text[];
  next_links text[];
  should_link boolean;
begin
  select field
    into source_field
  from workspace.databases d
  cross join lateral jsonb_array_elements(d.schema) as field
  where d.id = p_database_id
    and field->>'id' = p_relation_field_id
  limit 1;

  if source_field is null or source_field->>'type' <> 'relation' then
    raise exception 'Relation field % not found on database %', p_relation_field_id, p_database_id;
  end if;

  target_database_id := coalesce(nullif(source_field #>> '{relation,targetDatabaseId}', ''), p_database_id::text)::uuid;
  backlink_field_id := nullif(source_field #>> '{relation,targetRelationFieldId}', '');

  select *
    into source_record
  from workspace.records
  where id = p_record_id
    and database_id = p_database_id
  for update;

  if not found then
    raise exception 'Record % not found on database %', p_record_id, p_database_id;
  end if;

  normalized_ids := coalesce(
    array(select distinct value from unnest(coalesce(p_record_ids, array[]::text[])) as value where value is not null and btrim(value) <> ''),
    array[]::text[]
  );

  current_ids := coalesce(
    array(
      select value
      from jsonb_array_elements_text(
        case
          when jsonb_typeof(coalesce(source_record.fields, '{}'::jsonb)->p_relation_field_id) = 'array'
            then coalesce(source_record.fields, '{}'::jsonb)->p_relation_field_id
          else '[]'::jsonb
        end
      ) as value
    ),
    array[]::text[]
  );

  update workspace.records
  set fields = jsonb_set(coalesce(fields, '{}'::jsonb), array[p_relation_field_id], to_jsonb(normalized_ids), true),
      updated_at = now()
  where id = p_record_id
    and database_id = p_database_id
  returning * into source_record;

  if backlink_field_id is null or (target_database_id = p_database_id and backlink_field_id = p_relation_field_id) then
    return source_record;
  end if;

  affected_ids := coalesce(
    array(select distinct value from unnest(current_ids || normalized_ids) as value where value is not null and btrim(value) <> ''),
    array[]::text[]
  );

  if array_length(affected_ids, 1) is null then
    return source_record;
  end if;

  for target_record in
    select *
    from workspace.records
    where database_id = target_database_id
      and id::text = any(affected_ids)
    for update
  loop
    existing_links := coalesce(
      array(
        select value
        from jsonb_array_elements_text(
          case
            when jsonb_typeof(coalesce(target_record.fields, '{}'::jsonb)->backlink_field_id) = 'array'
              then coalesce(target_record.fields, '{}'::jsonb)->backlink_field_id
            else '[]'::jsonb
          end
        ) as value
      ),
      array[]::text[]
    );

    should_link := target_record.id::text = any(normalized_ids);
    if should_link then
      next_links := array(select distinct value from unnest(existing_links || p_record_id::text) as value where value is not null and btrim(value) <> '');
    else
      next_links := array(select distinct value from unnest(existing_links) as value where value <> p_record_id::text);
    end if;

    if next_links is distinct from existing_links then
      update workspace.records
      set fields = jsonb_set(coalesce(fields, '{}'::jsonb), array[backlink_field_id], to_jsonb(next_links), true),
          updated_at = now()
      where id = target_record.id;
    end if;
  end loop;

  return source_record;
end;
$$;

revoke all on function workspace.update_relation_links(uuid, uuid, text, text[]) from public;
grant execute on function workspace.update_relation_links(uuid, uuid, text, text[]) to anon, service_role;

create or replace function workspace.search_workspace(
  p_query text,
  p_entity text default null,
  p_limit integer default 25
)
returns table (
  source_type text,
  source_id text,
  title text,
  subtitle text,
  entity text,
  url text,
  excerpt text,
  rank real,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = workspace, intel, knowledge, public, pg_temp
as $$
  with normalized as (
    select
      nullif(btrim(p_query), '') as query_text,
      case when p_entity is null or btrim(p_entity) = '' then null else workspace.normalize_entity_slug(p_entity) end as entity_slug,
      greatest(1, least(coalesce(p_limit, 25), 100)) as result_limit
  ),
  query as (
    select
      query_text,
      entity_slug,
      result_limit,
      plainto_tsquery('english', query_text) as tsq
    from normalized
    where query_text is not null
  ),
  record_results as (
    select
      'workspace_record'::text as source_type,
      r.id::text as source_id,
      coalesce(
        r.fields->>(d.header_field_ids->>0),
        r.fields->>'name',
        r.fields->>'task_name',
        r.fields->>'initiative_name',
        r.fields->>'workflow_name',
        r.fields->>'run_name',
        d.name || ' record'
      ) as title,
      d.name as subtitle,
      r.entity,
      null::text as url,
      left(regexp_replace(coalesce(r.body, r.fields::text), '\s+', ' ', 'g'), 360) as excerpt,
      ts_rank_cd(
        to_tsvector(
          'english',
          concat_ws(
            ' ',
            d.name,
            r.entity,
            r.fields::text,
            coalesce(r.body, '')
          )
        ),
        q.tsq
      ) as rank,
      r.updated_at
    from query q
    join workspace.records r on q.entity_slug is null or r.entity = q.entity_slug
    join workspace.databases d on d.id = r.database_id
    where to_tsvector('english', concat_ws(' ', d.name, r.entity, r.fields::text, coalesce(r.body, ''))) @@ q.tsq
  ),
  knowledge_results as (
    select
      'knowledge_document'::text as source_type,
      k.id::text as source_id,
      k.title,
      coalesce(k.source_path, k.document_type, k.domain) as subtitle,
      k.entity,
      k.source_path as url,
      left(regexp_replace(coalesce(k.content, k.metadata::text, ''), '\s+', ' ', 'g'), 360) as excerpt,
      ts_rank_cd(
        to_tsvector('english', concat_ws(' ', k.title, k.source_path, k.document_type, k.domain, k.entity, coalesce(k.content, ''), coalesce(k.metadata::text, ''))),
        q.tsq
      ) as rank,
      k.updated_at
    from query q
    join knowledge.documents k on q.entity_slug is null or k.entity = q.entity_slug
    where to_tsvector('english', concat_ws(' ', k.title, k.source_path, k.document_type, k.domain, k.entity, coalesce(k.content, ''), coalesce(k.metadata::text, ''))) @@ q.tsq
  ),
  signal_results as (
    select
      'intel_signal'::text as source_type,
      s.id::text as source_id,
      s.title,
      concat_ws(' / ', s.source, s.watch_domain) as subtitle,
      s.entity,
      s.url,
      left(regexp_replace(coalesce(s.snippet, s.raw_payload::text, ''), '\s+', ' ', 'g'), 360) as excerpt,
      ts_rank_cd(
        to_tsvector('english', concat_ws(' ', s.title, s.source, s.watch_domain, s.entity, s.snippet, coalesce(s.raw_payload::text, ''))),
        q.tsq
      ) as rank,
      s.updated_at
    from query q
    join intel.signals s on q.entity_slug is null or s.entity = q.entity_slug
    where to_tsvector('english', concat_ws(' ', s.title, s.source, s.watch_domain, s.entity, s.snippet, coalesce(s.raw_payload::text, ''))) @@ q.tsq
  ),
  combined as (
    select * from record_results
    union all
    select * from knowledge_results
    union all
    select * from signal_results
  )
  select *
  from combined
  order by rank desc, updated_at desc
  limit (select result_limit from query);
$$;

revoke all on function workspace.search_workspace(text, text, integer) from public;
grant execute on function workspace.search_workspace(text, text, integer) to anon, service_role;
