alter table workspace_nodes
  add column if not exists case_id text references investigations(case_id) on delete cascade,
  add column if not exists project_id bigint references projects(id) on delete cascade;
create index if not exists workspace_nodes_case_id_idx on workspace_nodes (case_id);
create index if not exists workspace_nodes_project_id_idx on workspace_nodes (project_id);
