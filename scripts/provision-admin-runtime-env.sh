#!/usr/bin/env bash
set -euo pipefail

source_env="${1:-$(pwd)/.env.local}"
task_home="${HOME:?HOME is required}"
target_dir="${task_home}/Library/Application Support/IntelliZen"
target_env="${target_dir}/admin-runtime.env"

if [[ ! -f "${source_env}" ]]; then
  echo "Source environment file not found: ${source_env}" >&2
  exit 1
fi

task_tmp_dir="$(mktemp -d)"
task_tmp_env="${task_tmp_dir}/admin-runtime.env"
cleanup() {
  rm -f "${task_tmp_env}"
  rmdir "${task_tmp_dir}" 2>/dev/null || true
}
trap cleanup EXIT

awk -F= '
  $1 == "SUPABASE_URL" ||
  $1 == "VITE_SUPABASE_URL" ||
  $1 == "INTELLIZEN_LOCAL_ACCESS_KEY" ||
  $1 == "VITE_INTELLIZEN_LOCAL_ACCESS_KEY" {
    print
  }
' "${source_env}" > "${task_tmp_env}"

if ! grep -Eq '^(SUPABASE_URL|VITE_SUPABASE_URL)=' "${task_tmp_env}"; then
  echo "Source environment is missing the Supabase URL." >&2
  exit 1
fi
if ! grep -Eq '^(INTELLIZEN_LOCAL_ACCESS_KEY|VITE_INTELLIZEN_LOCAL_ACCESS_KEY)=' "${task_tmp_env}"; then
  echo "Source environment is missing the IntelliZen local-access key." >&2
  exit 1
fi

install -d -m 700 "${target_dir}"
install -m 600 "${task_tmp_env}" "${target_env}"
echo "Provisioned ${target_env} with mode 600."
