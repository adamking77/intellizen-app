-- Investigations schema for V2
-- Structured 6-phase investigation workflow

-- Investigations (cases) table
create table if not exists investigations (
  id             bigint generated always as identity primary key,
  case_id        text not null unique,           -- slug format: "case-2026-001"
  name           text not null,
  status         text not null default 'active'
                 check (status in ('active', 'archived', 'completed')),
  current_phase  int not null default 1
                 check (current_phase between 1 and 6),
  project_id     bigint references projects(id) on delete set null,
  
  -- Phase 1: Plan fields
  subject_definition text,
  investigation_scope text,
  plan_proportionality boolean default false,
  plan_legality boolean default false,
  plan_accountability boolean default false,
  plan_necessity boolean default false,
  seed_entities  text[] default '{}',
  known_hypotheses text[] default '{}',
  
  -- Phase gates (JSON for flexibility)
  phase_gates    jsonb default '{}',
  
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists investigations_case_id_idx on investigations (case_id);
create index if not exists investigations_status_idx on investigations (status);
create index if not exists investigations_project_id_idx on investigations (project_id);

-- Investigation signals (linking intel_signals to investigations)
create table if not exists investigation_signals (
  id               bigint generated always as identity primary key,
  investigation_id bigint not null references investigations(id) on delete cascade,
  signal_id        bigint not null references intel_signals(id) on delete cascade,
  phase_added      int not null default 2,  -- Phase 2 is Collect
  notes            text,
  added_at         timestamptz not null default now(),
  unique (investigation_id, signal_id)
);

create index if not exists investigation_signals_investigation_id_idx on investigation_signals (investigation_id);
create index if not exists investigation_signals_signal_id_idx on investigation_signals (signal_id);

-- Vault file tracking (for reports generated via claude -p)
create table if not exists vault_files (
  id             bigint generated always as identity primary key,
  case_id        text not null references investigations(case_id) on delete cascade,
  phase          int,                          -- which phase generated this (nullable for manual)
  file_type      text not null                 -- plan, collect, collate, timeline, ach, report
                 check (file_type in ('plan', 'collect', 'collate', 'timeline', 'ach', 'report', 'sweep', 'assessment', 'brief')),
  file_path      text not null,
  file_name      text not null,
  report_type    text,                         -- for reports: internal, client, deep, public
  generated_by   text default 'claude',        -- claude, manual, import
  created_at     timestamptz not null default now()
);

create index if not exists vault_files_case_id_idx on vault_files (case_id);
create index if not exists vault_files_file_type_idx on vault_files (file_type);

-- Auto-update trigger for investigations
drop trigger if exists investigations_updated_at on investigations;
create trigger investigations_updated_at
  before update on investigations
  for each row execute function update_updated_at();
