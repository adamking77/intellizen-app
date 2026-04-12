create table if not exists intel_signals (
  id             bigint generated always as identity primary key,
  monitor_id     bigint,
  title          text not null,
  url            text not null,
  source         text,
  published_at   timestamptz,
  snippet        text,
  watch_domain   text,
  exa_score      float,
  raw_payload    jsonb,
  status         text not null default 'new'
                 check (status in ('new', 'saved', 'dismissed')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists intel_signals_status_idx on intel_signals (status);
create index if not exists intel_signals_watch_domain_idx on intel_signals (watch_domain);
create index if not exists intel_signals_monitor_id_idx on intel_signals (monitor_id);
create index if not exists intel_signals_created_at_desc_idx on intel_signals (created_at desc);

create table if not exists projects (
  id             bigint generated always as identity primary key,
  name           text not null,
  type           text not null
                 check (type in ('report', 'scoping', 'research', 'client_case')),
  watch_domain   text,
  status         text not null default 'active'
                 check (status in ('active', 'archived')),
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists projects_type_idx on projects (type);
create index if not exists projects_status_idx on projects (status);

create table if not exists project_signals (
  id             bigint generated always as identity primary key,
  project_id     bigint not null references projects(id) on delete cascade,
  signal_id      bigint not null references intel_signals(id) on delete cascade,
  notes          text,
  added_at       timestamptz not null default now(),
  unique (project_id, signal_id)
);

create index if not exists project_signals_project_id_idx on project_signals (project_id);
create index if not exists project_signals_signal_id_idx on project_signals (signal_id);

create table if not exists monitors (
  id             bigint generated always as identity primary key,
  name           text not null,
  query          text not null,
  watch_domain   text not null,
  frequency      text not null default 'daily'
                 check (frequency in ('daily', 'weekly')),
  status         text not null default 'active'
                 check (status in ('active', 'paused')),
  last_run       timestamptz,
  signal_count   int not null default 0,
  created_at     timestamptz not null default now()
);

create index if not exists monitors_status_idx on monitors (status);
create index if not exists monitors_watch_domain_idx on monitors (watch_domain);

create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists intel_signals_updated_at on intel_signals;
create trigger intel_signals_updated_at
  before update on intel_signals
  for each row execute function update_updated_at();

drop trigger if exists projects_updated_at on projects;
create trigger projects_updated_at
  before update on projects
  for each row execute function update_updated_at();
