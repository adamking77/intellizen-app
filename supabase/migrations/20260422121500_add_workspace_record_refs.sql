alter table investigations
  add column if not exists project_record_id uuid references workspace_records(id) on delete set null,
  add column if not exists operation_record_id uuid references workspace_records(id) on delete set null;

create index if not exists investigations_project_record_id_idx on investigations (project_record_id);
create index if not exists investigations_operation_record_id_idx on investigations (operation_record_id);

alter table vault_files
  add column if not exists project_record_id uuid references workspace_records(id) on delete set null;

create index if not exists vault_files_project_record_id_idx on vault_files (project_record_id);

alter table workspace_nodes
  add column if not exists project_record_id uuid references workspace_records(id) on delete set null;

create index if not exists workspace_nodes_project_record_id_idx on workspace_nodes (project_record_id);

alter table canvas_documents
  add column if not exists project_record_id uuid references workspace_records(id) on delete set null;

create index if not exists canvas_documents_project_record_id_idx on canvas_documents (project_record_id);

with project_records as (
  select distinct on (legacy_id)
    legacy_id,
    record_id
  from (
    select
      nullif(wr.fields ->> 'legacy_project_id', '')::bigint as legacy_id,
      wr.id as record_id,
      wr.updated_at
    from workspace_records wr
    join workspace_databases wd on wd.id = wr.database_id
    where wd.icon = 'intel-system:projects'
  ) rows
  where legacy_id is not null
  order by legacy_id, updated_at desc, record_id
)
update investigations i
set project_record_id = coalesce(i.project_record_id, pr.record_id)
from project_records pr
where i.project_id is not null
  and pr.legacy_id = i.project_id;

with operation_records as (
  select distinct on (legacy_id)
    legacy_id,
    record_id
  from (
    select
      nullif(wr.fields ->> 'legacy_operation_id', '')::bigint as legacy_id,
      wr.id as record_id,
      wr.updated_at
    from workspace_records wr
    join workspace_databases wd on wd.id = wr.database_id
    where wd.icon = 'intel-system:operations'
  ) rows
  where legacy_id is not null
  order by legacy_id, updated_at desc, record_id
)
update investigations i
set operation_record_id = coalesce(i.operation_record_id, orr.record_id)
from operation_records orr
where i.operation_id is not null
  and orr.legacy_id = i.operation_id;

with project_records as (
  select distinct on (legacy_id)
    legacy_id,
    record_id
  from (
    select
      nullif(wr.fields ->> 'legacy_project_id', '')::bigint as legacy_id,
      wr.id as record_id,
      wr.updated_at
    from workspace_records wr
    join workspace_databases wd on wd.id = wr.database_id
    where wd.icon = 'intel-system:projects'
  ) rows
  where legacy_id is not null
  order by legacy_id, updated_at desc, record_id
)
update vault_files vf
set project_record_id = coalesce(vf.project_record_id, pr.record_id)
from project_records pr
where vf.project_id is not null
  and pr.legacy_id = vf.project_id;

with project_records as (
  select distinct on (legacy_id)
    legacy_id,
    record_id
  from (
    select
      nullif(wr.fields ->> 'legacy_project_id', '')::bigint as legacy_id,
      wr.id as record_id,
      wr.updated_at
    from workspace_records wr
    join workspace_databases wd on wd.id = wr.database_id
    where wd.icon = 'intel-system:projects'
  ) rows
  where legacy_id is not null
  order by legacy_id, updated_at desc, record_id
)
update workspace_nodes wn
set project_record_id = coalesce(wn.project_record_id, pr.record_id)
from project_records pr
where wn.project_id is not null
  and pr.legacy_id = wn.project_id;

with project_records as (
  select distinct on (legacy_id)
    legacy_id,
    record_id
  from (
    select
      nullif(wr.fields ->> 'legacy_project_id', '')::bigint as legacy_id,
      wr.id as record_id,
      wr.updated_at
    from workspace_records wr
    join workspace_databases wd on wd.id = wr.database_id
    where wd.icon = 'intel-system:projects'
  ) rows
  where legacy_id is not null
  order by legacy_id, updated_at desc, record_id
)
update canvas_documents cd
set project_record_id = coalesce(cd.project_record_id, pr.record_id)
from project_records pr
where cd.project_id is not null
  and pr.legacy_id = cd.project_id;
