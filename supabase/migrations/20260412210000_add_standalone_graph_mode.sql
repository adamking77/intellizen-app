-- Enable standalone (manual) graph mode by making project_id nullable
-- This allows graphs to exist independently of projects

alter table graph_nodes alter column project_id drop not null;
alter table graph_edges alter column project_id drop not null;

-- Add index for standalone graphs (where project_id is null)
create index if not exists graph_nodes_standalone_idx on graph_nodes (project_id) where project_id is null;
create index if not exists graph_edges_standalone_idx on graph_edges (project_id) where project_id is null;

-- Add comment explaining the dual-mode architecture
comment on table graph_nodes is 'Graph nodes for entity-relationship visualization. Can be project-linked (project_id set) or standalone/manual (project_id null).';
comment on table graph_edges is 'Graph edges connecting nodes. Can be project-linked (project_id set) or standalone/manual (project_id null).';
