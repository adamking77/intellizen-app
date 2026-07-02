-- OSINT entity layer + graded claims (osint-workflow-analysis.md, Phase C).
-- Entities are canonical and persist ACROSS cases (POLE model, org-extended);
-- claims are discrete graded assertions (Admiralty 6x6) feeding ACH analysis.

create table if not exists intel.entities (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('person', 'organization', 'object', 'location', 'event')),
  name text not null,
  aliases text[] not null default '{}',
  external_ids jsonb not null default '{}'::jsonb,
  summary text,
  confidence text check (confidence in ('confirmed', 'probable', 'possible', 'doubtful')),
  first_case_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists intel_entities_type_idx on intel.entities (entity_type, name);
create index if not exists intel_entities_lower_name_idx on intel.entities (lower(name));

create table if not exists intel.entity_signals (
  entity_id uuid not null references intel.entities(id) on delete cascade,
  signal_id bigint not null,
  case_id text,
  note text,
  created_at timestamptz not null default now(),
  primary key (entity_id, signal_id)
);

create index if not exists intel_entity_signals_signal_idx on intel.entity_signals (signal_id);
create index if not exists intel_entity_signals_case_idx on intel.entity_signals (case_id);

create table if not exists intel.claims (
  id uuid primary key default gen_random_uuid(),
  case_id text,
  claim text not null,
  entity_ids uuid[] not null default '{}',
  -- Admiralty 6x6: source reliability A-F x information credibility 1-6
  source_reliability text check (source_reliability in ('A', 'B', 'C', 'D', 'E', 'F')),
  info_credibility smallint check (info_credibility between 1 and 6),
  claim_origin text check (claim_origin in ('osint', 'humint', 'analysis')),
  event_date timestamptz,
  supporting_signal_ids bigint[] not null default '{}',
  contradicting_signal_ids bigint[] not null default '{}',
  recorded_by text not null,
  created_at timestamptz not null default now()
);

create index if not exists intel_claims_case_idx on intel.claims (case_id, created_at desc);
create index if not exists intel_claims_entities_idx on intel.claims using gin (entity_ids);

-- Admiralty grading on raw signals
alter table intel.signals add column if not exists source_reliability text
  check (source_reliability in ('A', 'B', 'C', 'D', 'E', 'F'));
alter table intel.signals add column if not exists info_credibility smallint
  check (info_credibility between 1 and 6);

alter table intel.entities enable row level security;
alter table intel.entity_signals enable row level security;
alter table intel.claims enable row level security;

grant select, insert, update, delete on intel.entities to service_role;
grant select, insert, update, delete on intel.entity_signals to service_role;
grant select, insert on intel.claims to service_role;
-- Claims are analytical record: no update/delete surface (supersede by new claim).
revoke update, delete, truncate on intel.claims from service_role;

drop trigger if exists intel_entities_updated_at on intel.entities;
create trigger intel_entities_updated_at
  before update on intel.entities
  for each row execute function public.update_updated_at();
