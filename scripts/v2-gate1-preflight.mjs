import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function parseEnv(contents) {
  return Object.fromEntries(
    contents
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        return [
          line.slice(0, separator).trim(),
          line
            .slice(separator + 1)
            .trim()
            .replace(/^['"]|['"]$/g, ""),
        ];
      }),
  );
}

const localEnv = parseEnv(await readFile(join(projectRoot, ".env.local"), "utf8"));
const supabaseUrl =
  process.env.SUPABASE_URL ??
  process.env.VITE_SUPABASE_URL ??
  localEnv.SUPABASE_URL ??
  localEnv.VITE_SUPABASE_URL;
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? localEnv.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  throw new Error("Gate 1 preflight requires the local Supabase URL and service-role key.");
}

const client = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const databaseIds = {
  workflowRuns: "c1000000-0000-0000-0000-000000000002",
  roles: "c1000000-0000-0000-0000-000000000003",
  agents: "c1000000-0000-0000-0000-000000000004",
  roleAssignments: "c1000000-0000-0000-0000-000000000005",
};
const reservedRunKeys = [
  "run_schema_version",
  "run_definition_snapshot",
  "run_current_step_id",
  "run_version",
  "run_step_states",
  "run_dispatcher_session",
  "run_fencing_token",
  "run_lease_expires_at",
  "run_approvals",
  "run_context_evidence",
];

async function readAll(schema, table, columns, configure = (query) => query) {
  const rows = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    let query = client
      .schema(schema)
      .from(table)
      .select(columns)
      .range(from, from + pageSize - 1);
    query = configure(query);
    const { data, error } = await query;
    if (error) throw new Error(`${schema}.${table} preflight failed: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < pageSize) return rows;
  }
}

const [databases, records, workflowRuns, workEvents] = await Promise.all([
  readAll("workspace", "databases", "id,name"),
  readAll(
    "workspace",
    "records",
    "id,database_id,fields",
    (query) =>
      query.in("database_id", [
        databaseIds.roles,
        databaseIds.agents,
        databaseIds.roleAssignments,
      ]),
  ),
  readAll(
    "workspace",
    "records",
    "id,fields",
    (query) => query.eq("database_id", databaseIds.workflowRuns),
  ),
  readAll("workspace", "work_events", "id,workflow_run_id"),
]);

const byDatabase = Object.groupBy(records, (record) => record.database_id);
const roles = byDatabase[databaseIds.roles] ?? [];
const agents = byDatabase[databaseIds.agents] ?? [];
const assignments = byDatabase[databaseIds.roleAssignments] ?? [];

function duplicateValues(values) {
  const counts = new Map();
  values.filter(Boolean).forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([value, count]) => ({ value, count }));
}

const activeAssignments = assignments.filter(
  (record) => record.fields?.role_assignment_status === "active",
);
const roleIds = new Set(roles.map((record) => record.id));
const agentIds = new Set(agents.map((record) => record.id));
const relationProblems = assignments.filter((record) => {
  const role = record.fields?.role_assignment_role?.[0];
  const agent = record.fields?.role_assignment_agent?.[0];
  return !role || !agent || !roleIds.has(role) || !agentIds.has(agent);
}).length;

const referencedRunIds = [
  ...new Set(workEvents.map((event) => event.workflow_run_id).filter(Boolean)),
];
const runIds = new Set(workflowRuns.map((record) => record.id));
const orphanRunReferences = referencedRunIds.filter((id) => !runIds.has(id)).length;

let proofColumnsPresent = true;
let idempotencyCollisions = [];
const proofColumnProbe = await client
  .schema("workspace")
  .from("work_events")
  .select("workflow_run_id,idempotency_key")
  .not("idempotency_key", "is", null)
  .limit(500);
if (proofColumnProbe.error) {
  proofColumnsPresent = false;
} else {
  idempotencyCollisions = duplicateValues(
    (proofColumnProbe.data ?? []).map(
      (event) => `${event.workflow_run_id}:${event.idempotency_key}`,
    ),
  );
}

const result = {
  inspection_mode: "read-only",
  database_count: databases.length,
  proposed_database_id_collisions: databases
    .filter((database) =>
      [databaseIds.roles, databaseIds.agents, databaseIds.roleAssignments].includes(
        database.id,
      ),
    )
    .map((database) => ({ id: database.id, name: database.name })),
  role_key_conflicts: duplicateValues(
    roles.map((record) => record.fields?.role_key),
  ),
  agent_key_conflicts: duplicateValues(
    agents.map((record) => record.fields?.agent_key),
  ),
  active_role_occupant_conflicts: duplicateValues(
    activeAssignments.map(
      (record) => record.fields?.role_assignment_role?.[0],
    ),
  ),
  active_role_agent_pair_conflicts: duplicateValues(
    activeAssignments.map(
      (record) =>
        `${record.fields?.role_assignment_role?.[0]}:${record.fields?.role_assignment_agent?.[0]}`,
    ),
  ),
  assignment_relation_problems: relationProblems,
  workflow_runs_with_reserved_gate1_keys: workflowRuns.filter((record) =>
    reservedRunKeys.some((key) =>
      Object.prototype.hasOwnProperty.call(record.fields ?? {}, key),
    ),
  ).length,
  work_event_workflow_run_orphans: orphanRunReferences,
  proof_columns_present: proofColumnsPresent,
  idempotency_collisions: idempotencyCollisions,
};

console.log(JSON.stringify(result, null, 2));

