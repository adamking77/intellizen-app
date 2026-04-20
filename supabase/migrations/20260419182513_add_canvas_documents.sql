create table if not exists canvas_documents (
  id           bigint generated always as identity primary key,
  project_id   bigint references projects(id) on delete cascade,
  case_id      text references investigations(case_id) on delete cascade,
  name         text not null,
  content_json jsonb not null default '{"nodes":[],"edges":[],"sogo":{"background":"dots","snapToGrid":false}}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists canvas_documents_updated_at_idx on canvas_documents (updated_at desc);
create index if not exists canvas_documents_project_id_idx on canvas_documents (project_id);
create index if not exists canvas_documents_case_id_idx on canvas_documents (case_id);

drop trigger if exists canvas_documents_updated_at on canvas_documents;
create trigger canvas_documents_updated_at
  before update on canvas_documents
  for each row execute function update_updated_at();;
