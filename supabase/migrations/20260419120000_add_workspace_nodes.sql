create table if not exists workspace_nodes (
  id          bigint generated always as identity primary key,
  parent_id   bigint references workspace_nodes(id) on delete cascade,
  kind        text not null check (kind in ('folder', 'file')),
  name        text not null,
  path        text not null unique,
  content     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint workspace_nodes_content_check check (
    (kind = 'folder' and content is null) or kind = 'file'
  )
);
create index if not exists workspace_nodes_parent_id_idx on workspace_nodes (parent_id);
create index if not exists workspace_nodes_path_idx on workspace_nodes (path);
drop trigger if exists workspace_nodes_updated_at on workspace_nodes;
create trigger workspace_nodes_updated_at
  before update on workspace_nodes
  for each row execute function update_updated_at();
