#!/usr/bin/env bash
set -euo pipefail
export PGOPTIONS="-c client_min_messages=warning"

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
postgres_bin="${INTELLIZEN_TEST_POSTGRES_BIN:-}"
if [[ -z "$postgres_bin" ]] && command -v postgres >/dev/null 2>&1; then
  postgres_bin="$(dirname "$(command -v postgres)")"
fi
if [[ -z "$postgres_bin" ]] && command -v brew >/dev/null 2>&1; then
  brew_postgres_prefix="$(brew --prefix postgresql@17 2>/dev/null || true)"
  if [[ -x "$brew_postgres_prefix/bin/postgres" ]]; then
    postgres_bin="$brew_postgres_prefix/bin"
  fi
fi
if [[ -z "$postgres_bin" ]]; then
  echo "PostgreSQL 17 server binaries are required."
  echo "Set INTELLIZEN_TEST_POSTGRES_BIN to a directory containing postgres, initdb, and pg_ctl."
  exit 1
fi
for required_binary in postgres initdb pg_ctl pg_config psql; do
  if [[ ! -x "$postgres_bin/$required_binary" ]]; then
    echo "PostgreSQL server tool is missing: $postgres_bin/$required_binary"
    exit 1
  fi
done
postgres_share="$("$postgres_bin/pg_config" --sharedir)"
if [[ ! -f "$postgres_share/postgres.bki" ]]; then
  postgres_share="$(cd "$postgres_bin/../share/postgresql" 2>/dev/null && pwd || true)"
fi
if [[ ! -f "$postgres_share/postgres.bki" ]]; then
  echo "PostgreSQL server support files are missing (postgres.bki)."
  exit 1
fi

cluster_root="$(mktemp -d "${TMPDIR:-/tmp}/intellizen-v2-sql.XXXXXX")"
data_dir="$cluster_root/data"
socket_dir="$cluster_root/socket"
mkdir -p "$socket_dir"
port="$(
  node -e '
    const server = require("node:net").createServer();
    server.listen(0, "127.0.0.1", () => {
      process.stdout.write(String(server.address().port));
      server.close();
    });
  '
)"
started=0

cleanup() {
  if [[ "$started" -eq 1 ]]; then
    "$postgres_bin/pg_ctl" -D "$data_dir" -m fast stop >/dev/null 2>&1 || true
  fi
  if [[ -d "$cluster_root" && "$(basename "$cluster_root")" == intellizen-v2-sql.* ]]; then
    rm -rf "$cluster_root"
  fi
}
trap cleanup EXIT INT TERM

"$postgres_bin/initdb" \
  -D "$data_dir" \
  -U postgres \
  --auth=trust \
  --encoding=UTF8 \
  --no-locale \
  -L "$postgres_share" \
  >/dev/null
"$postgres_bin/pg_ctl" \
  -D "$data_dir" \
  -o "-p $port -k $socket_dir -c listen_addresses=127.0.0.1 -c wal_level=logical" \
  -w start \
  >/dev/null
started=1

psql_args=(
  --host="$socket_dir"
  --port="$port"
  --username=postgres
  --dbname=postgres
  --set=ON_ERROR_STOP=1
  --no-psqlrc
)

"$postgres_bin/psql" "${psql_args[@]}" <<'SQL' >/dev/null
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema extensions;
create extension pgcrypto with schema extensions;
alter database postgres set search_path = public, extensions;

-- Supabase-hosted baseline objects that predate this repository's migration
-- history. The contract runner supplies their minimum shape so every checked-in
-- migration can replay without touching a shared project.
create schema knowledge;
create schema agent;
create schema system;
create schema comms;
create schema cron;
create table public.documents (id bigint generated always as identity primary key);
create table public.fiona_inbox (id bigint generated always as identity primary key);
create table knowledge.documents (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  source_path text,
  document_type text,
  domain text,
  content text,
  embedding text,
  metadata jsonb not null default '{}'::jsonb,
  taxonomy jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create table knowledge.chunks (
  id bigint generated always as identity primary key,
  document_id uuid references knowledge.documents(id),
  embedding text
);
create table agent.skills (
  id bigint generated always as identity primary key,
  name text not null default '',
  description text not null default ''
);
create table agent.memory (id bigint generated always as identity primary key);
create table agent.mcp_catalog (id bigint generated always as identity primary key);
create table agent.mcp_servers (id bigint generated always as identity primary key);
create table system.config (
  id bigint generated always as identity primary key,
  file_path text not null,
  content text,
  updated_at timestamptz not null default now()
);
create table comms.fiona_inbox (
  id uuid primary key default gen_random_uuid(),
  from_agent text not null,
  task text not null,
  context jsonb,
  priority text,
  status text,
  result text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.memory (id bigint);
create table public.memory_chunks (id bigint);
create table cron.job (jobname text primary key);
create function cron.unschedule(text) returns boolean
language sql as 'select true';
create function cron.schedule(text, text, text) returns bigint
language sql as 'select 1::bigint';
SQL

for migration in "$repo_dir"/supabase/migrations/*.sql; do
  if [[ "$(basename "$migration")" == "20260610075013_entity_first_taxonomy_metadata.sql" ]]; then
    echo "Applying isolated hosted-baseline normalization"
    "$postgres_bin/psql" \
      "${psql_args[@]}" \
      --file="$repo_dir/supabase/tests/v2_isolated_baseline.sql" \
      >/dev/null
  fi
  echo "Applying $(basename "$migration")"
  "$postgres_bin/psql" "${psql_args[@]}" --file="$migration" >/dev/null
done

contracts=(
  "v2_gate1_schema_contract.sql"
  "v2_gate1_workflow_contract.sql"
  "v2_audit_receipt_contract.sql"
  "v3_hierarchy_nodes_contract.sql"
)
for contract in "${contracts[@]}"; do
  echo "Running $contract"
  "$postgres_bin/psql" \
    "${psql_args[@]}" \
    --file="$repo_dir/supabase/tests/$contract" \
    >/dev/null
done

echo "V2 isolated SQL contracts passed (4/4)."
