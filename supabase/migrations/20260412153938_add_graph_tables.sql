create table if not exists graph_nodes (
  id             bigint generated always as identity primary key,
  project_id     bigint not null references projects(id) on delete cascade,
  node_id        text not null,
  label          text not null,
  entity_type    text not null
                 check (entity_type in ('person', 'organisation', 'location', 'event')),
  position_x     double precision not null,
  position_y     double precision not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (project_id, node_id)
);

create index if not exists graph_nodes_project_id_idx on graph_nodes (project_id);
create index if not exists graph_nodes_entity_type_idx on graph_nodes (entity_type);

create table if not exists graph_edges (
  id             bigint generated always as identity primary key,
  project_id     bigint not null references projects(id) on delete cascade,
  edge_id        text not null,
  source_node_id text not null,
  target_node_id text not null,
  label          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (project_id, edge_id)
);

create index if not exists graph_edges_project_id_idx on graph_edges (project_id);
create index if not exists graph_edges_source_node_id_idx on graph_edges (source_node_id);
create index if not exists graph_edges_target_node_id_idx on graph_edges (target_node_id);

drop trigger if exists graph_nodes_updated_at on graph_nodes;
create trigger graph_nodes_updated_at
  before update on graph_nodes
  for each row execute function update_updated_at();

drop trigger if exists graph_edges_updated_at on graph_edges;
create trigger graph_edges_updated_at
  before update on graph_edges
  for each row execute function update_updated_at();
