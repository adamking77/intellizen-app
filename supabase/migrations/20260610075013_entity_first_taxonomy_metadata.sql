-- Entity-first taxonomy metadata for GenZen OS / IntelliZen.
-- Non-destructive: adds metadata columns and backfills obvious routing labels.

alter table workspace.records
  add column if not exists taxonomy jsonb not null default '{}'::jsonb;

alter table intel.investigations
  add column if not exists taxonomy jsonb not null default '{}'::jsonb;

alter table agent.skills
  add column if not exists taxonomy jsonb not null default '{}'::jsonb;

alter table agent.memory
  add column if not exists taxonomy jsonb not null default '{}'::jsonb;

alter table agent.mcp_catalog
  add column if not exists taxonomy jsonb not null default '{}'::jsonb;

alter table agent.mcp_servers
  add column if not exists taxonomy jsonb not null default '{}'::jsonb;

create index if not exists workspace_databases_taxonomy_gin_idx on workspace.databases using gin (taxonomy);
create index if not exists workspace_records_taxonomy_gin_idx on workspace.records using gin (taxonomy);
create index if not exists anchors_operations_taxonomy_gin_idx on anchors.operations using gin (taxonomy);
create index if not exists anchors_projects_taxonomy_gin_idx on anchors.projects using gin (taxonomy);
create index if not exists knowledge_documents_taxonomy_gin_idx on knowledge.documents using gin (taxonomy);
create index if not exists intel_investigations_taxonomy_gin_idx on intel.investigations using gin (taxonomy);
create index if not exists agent_skills_taxonomy_gin_idx on agent.skills using gin (taxonomy);
create index if not exists agent_memory_taxonomy_gin_idx on agent.memory using gin (taxonomy);

update workspace.databases
set taxonomy = coalesce(taxonomy, '{}'::jsonb) || jsonb_build_object(
  'entity', 'genzen',
  'entity_label', 'GenZen',
  'area', 'internal_ops',
  'area_label', 'Internal Ops',
  'folder', 'Biz Ops',
  'object_type', 'database',
  'routing_rule', 'named_database_wins'
)
where name = 'Biz Ops';

update workspace.databases
set taxonomy = coalesce(taxonomy, '{}'::jsonb) || jsonb_build_object(
  'entity', 'genzen_solutions',
  'entity_label', 'GenZen Solutions',
  'area', 'revenue',
  'area_label', 'Revenue',
  'folder', name,
  'object_type', 'database',
  'routing_rule', 'named_database_wins'
)
where name in ('CRM', 'Clients', 'Introducers');

update workspace.databases
set taxonomy = coalesce(taxonomy, '{}'::jsonb) || jsonb_build_object(
  'entity', 'genzen',
  'entity_label', 'GenZen',
  'area', 'internal_ops',
  'area_label', 'Internal Ops',
  'folder', 'Tasks',
  'object_type', 'database',
  'routing_rule', 'named_database_wins'
)
where name = 'Tasks';

update workspace.databases
set taxonomy = coalesce(taxonomy, '{}'::jsonb) || jsonb_build_object(
  'entity', 'genzen',
  'entity_label', 'GenZen',
  'area', 'internal_ops',
  'area_label', 'Internal Ops',
  'folder', 'Operations',
  'object_type', 'system_database',
  'routing_rule', 'intellizen_operations_surface'
)
where icon = 'intel-system:operations';

update workspace.databases
set taxonomy = coalesce(taxonomy, '{}'::jsonb) || jsonb_build_object(
  'entity', 'genzen',
  'entity_label', 'GenZen',
  'area', 'internal_ops',
  'area_label', 'Internal Ops',
  'folder', 'Projects',
  'object_type', 'system_database',
  'routing_rule', 'intellizen_projects_surface'
)
where icon = 'intel-system:projects';

with record_context as (
  select r.id,
    d.name as database_name,
    lower(coalesce(r.fields::text, '') || ' ' || coalesce(r.body, '')) as searchable
  from workspace.records r
  join workspace.databases d on d.id = r.database_id
)
update workspace.records r
set taxonomy = coalesce(r.taxonomy, '{}'::jsonb) || jsonb_build_object(
  'entity', case
    when rc.searchable ~ '(sogo|category scout|neurodiv|neuros\.gokart\.studio)' then 'gokart_studio'
    when rc.database_name in ('CRM', 'Clients', 'Introducers') then 'genzen_solutions'
    else 'genzen'
  end,
  'entity_label', case
    when rc.searchable ~ '(sogo|category scout|neurodiv|neuros\.gokart\.studio)' then 'GoKart Studio'
    when rc.database_name in ('CRM', 'Clients', 'Introducers') then 'GenZen Solutions'
    else 'GenZen'
  end,
  'area', case
    when rc.searchable ~ '(sogo|category scout|neurodiv|neuros\.gokart\.studio)' then 'product_systems'
    when rc.database_name in ('CRM', 'Clients', 'Introducers') then 'revenue'
    else 'internal_ops'
  end,
  'area_label', case
    when rc.searchable ~ '(sogo|category scout|neurodiv|neuros\.gokart\.studio)' then 'Product & Systems'
    when rc.database_name in ('CRM', 'Clients', 'Introducers') then 'Revenue'
    else 'Internal Ops'
  end,
  'folder', case
    when rc.searchable ~ '(neurodiv|neuros\.gokart\.studio)' then 'NeuroDiv OS'
    when rc.searchable ~ 'category scout' then 'Category Scout'
    when rc.searchable ~ 'sogo' then 'Sogo Artifacts'
    else rc.database_name
  end,
  'object_type', 'database_record',
  'routing_rule', 'named_database_wins'
)
from record_context rc
where r.id = rc.id;

update anchors.operations
set taxonomy = coalesce(taxonomy, '{}'::jsonb) || jsonb_build_object(
  'entity', 'genzen_solutions',
  'entity_label', 'GenZen Solutions',
  'area', 'research_intelligence',
  'area_label', 'Research & Intelligence',
  'folder', replace(name, 'Spec Op: ', ''),
  'object_type', 'operation'
)
where lower(name) like '%shadow lotus%';

update anchors.projects
set taxonomy = coalesce(taxonomy, '{}'::jsonb) || jsonb_build_object(
  'entity', case
    when lower(name || ' ' || coalesce(notes, '')) ~ '(sogo|category scout|neurodiv|neuros\.gokart\.studio|adhd divergent)' then 'gokart_studio'
    when lower(name || ' ' || coalesce(notes, '')) ~ '(agent|hermes|intellizen|supabase|mcp|openosint|seo|geo)' then 'genzen'
    when operation_id is not null then 'genzen_solutions'
    else 'genzen'
  end,
  'entity_label', case
    when lower(name || ' ' || coalesce(notes, '')) ~ '(sogo|category scout|neurodiv|neuros\.gokart\.studio|adhd divergent)' then 'GoKart Studio'
    when lower(name || ' ' || coalesce(notes, '')) ~ '(agent|hermes|intellizen|supabase|mcp|openosint|seo|geo)' then 'GenZen'
    when operation_id is not null then 'GenZen Solutions'
    else 'GenZen'
  end,
  'area', case
    when lower(name || ' ' || coalesce(notes, '')) ~ '(sogo|category scout|neurodiv|neuros\.gokart\.studio|adhd divergent)' then 'product_systems'
    when lower(name || ' ' || coalesce(notes, '')) ~ '(agent|hermes|intellizen|supabase|mcp|openosint|seo|geo)' then 'product_systems'
    else 'research_intelligence'
  end,
  'area_label', case
    when lower(name || ' ' || coalesce(notes, '')) ~ '(sogo|category scout|neurodiv|neuros\.gokart\.studio|adhd divergent|agent|hermes|intellizen|supabase|mcp|openosint|seo|geo)' then 'Product & Systems'
    else 'Research & Intelligence'
  end,
  'folder', case
    when lower(name || ' ' || coalesce(notes, '')) ~ '(neurodiv|neuros\.gokart\.studio|adhd divergent)' then 'NeuroDiv OS'
    when lower(name || ' ' || coalesce(notes, '')) ~ 'category scout' then 'Category Scout'
    when lower(name || ' ' || coalesce(notes, '')) ~ 'sogo' then 'Sogo Artifacts'
    when lower(name || ' ' || coalesce(notes, '')) ~ '(agent|hermes|intellizen|supabase|mcp|openosint|seo|geo)' then 'GenZen OS'
    when operation_id is not null then 'Shadow Lotus'
    else name
  end,
  'object_type', 'intellizen_project',
  'routing_rule', 'explicit_intellizen_project_only'
);

update anchors.projects
set taxonomy = coalesce(taxonomy, '{}'::jsonb) || jsonb_build_object(
  'entity', 'genzen_solutions',
  'entity_label', 'GenZen Solutions',
  'area', 'revenue',
  'area_label', 'Revenue',
  'folder', 'Distribution Research',
  'object_type', 'intellizen_project',
  'routing_rule', 'explicit_intellizen_project_only'
)
where name = 'GenZen Distribution Research';

update anchors.projects
set taxonomy = coalesce(taxonomy, '{}'::jsonb) || jsonb_build_object(
  'entity', 'genzen',
  'entity_label', 'GenZen',
  'area', 'research_intelligence',
  'area_label', 'Research & Intelligence',
  'folder', 'Selling to Agents',
  'object_type', 'intellizen_project',
  'routing_rule', 'explicit_intellizen_project_only'
)
where name = 'Selling to Agents: Positioning Research';

update knowledge.documents
set taxonomy = coalesce(taxonomy, '{}'::jsonb) || jsonb_build_object(
  'entity', case
    when lower(coalesce(source_path, '') || ' ' || title) ~ '(gokart|sogo|category scout|neurodiv|neuros\.gokart\.studio)' then 'gokart_studio'
    when lower(coalesce(source_path, '') || ' ' || title) ~ '(genzen solutions|gzs|shadow lotus|client|crm|introducer)' then 'genzen_solutions'
    when document_type in ('founder_context', 'kindle_highlight') or domain = 'personal' or lower(coalesce(source_path, '')) like 'founder/%' then 'founder_context'
    else 'genzen'
  end,
  'area', case
    when document_type in ('founder_context', 'kindle_highlight') or domain = 'personal' or lower(coalesce(source_path, '')) like 'founder/%' then 'founder_context'
    when lower(coalesce(source_path, '') || ' ' || title) ~ '(supabase|agent|mcp|skill|sogo|category scout|neurodiv|neuros\.gokart\.studio|intellizen)' then 'product_systems'
    when lower(coalesce(source_path, '') || ' ' || title) ~ '(crm|client|introducer|sales|distribution)' then 'revenue'
    when lower(coalesce(source_path, '') || ' ' || title) ~ '(research|intelligence|investigation|shadow lotus)' then 'research_intelligence'
    else 'company_hq'
  end,
  'object_type', 'knowledge_document'
);

update intel.investigations i
set taxonomy = coalesce(i.taxonomy, '{}'::jsonb) || jsonb_build_object(
  'entity', coalesce(p.taxonomy->>'entity', 'genzen'),
  'entity_label', coalesce(p.taxonomy->>'entity_label', 'GenZen'),
  'area', coalesce(p.taxonomy->>'area', 'research_intelligence'),
  'area_label', coalesce(p.taxonomy->>'area_label', 'Research & Intelligence'),
  'folder', coalesce(p.taxonomy->>'folder', i.name),
  'object_type', 'investigation'
)
from anchors.projects p
where i.project_id = p.id;

update intel.investigations
set taxonomy = coalesce(taxonomy, '{}'::jsonb) || jsonb_build_object(
  'entity', 'genzen',
  'entity_label', 'GenZen',
  'area', 'research_intelligence',
  'area_label', 'Research & Intelligence',
  'folder', name,
  'object_type', 'investigation'
)
where taxonomy = '{}'::jsonb;

update agent.skills
set taxonomy = coalesce(taxonomy, '{}'::jsonb) || jsonb_build_object(
  'entity', case when lower(name || ' ' || description) ~ '(sogo|category scout|neurodiv|gokart)' then 'gokart_studio' else 'genzen' end,
  'area', 'product_systems',
  'folder', case when lower(name || ' ' || description) ~ '(sogo|category scout|neurodiv|gokart)' then 'GoKart Product Systems' else 'GenZen OS' end,
  'object_type', 'agent_skill'
);
