import { assertPersistenceSafe } from "../../shared/persistence-redaction.mjs";
import { dryRunPreview } from "./write-contract.js";

export type McpPlane = "admin" | "worker";

export const ROSTER_DATABASE_IDS = {
  roles: "c1000000-0000-0000-0000-000000000003",
  agents: "c1000000-0000-0000-0000-000000000004",
  roleAssignments: "c1000000-0000-0000-0000-000000000005",
  workflowRuns: "c1000000-0000-0000-0000-000000000002",
} as const;

const PROTECTED_FIELDS = new Map<string, ReadonlySet<string>>([
  [
    ROSTER_DATABASE_IDS.roles,
    new Set([
      "role_authority_ceiling",
      "role_owner_gate",
      "role_delegation_policy",
      "role_verification_eligible",
      "role_status",
    ]),
  ],
  [
    ROSTER_DATABASE_IDS.agents,
    new Set(["agent_key", "agent_status"]),
  ],
  [
    ROSTER_DATABASE_IDS.roleAssignments,
    new Set([
      "role_assignment_role",
      "role_assignment_agent",
      "role_assignment_binding_ref",
      "role_assignment_status",
    ]),
  ],
  [
    ROSTER_DATABASE_IDS.workflowRuns,
    new Set([
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
    ]),
  ],
]);

export const WORKER_TOOL_NAMES = new Set([
  "list_agent_projects",
  "list_agent_work",
  "list_databases",
  "query_records",
  "list_roles",
  "list_role_assignments",
  "list_workflows",
  "list_workflow_runs",
  "advance_workflow_step",
  "report_verification",
  "append_agent_work_note",
]);

const WORKER_ENV_EXEMPTIONS = new Set([
  "CODEX_HOME",
  "CLAUDE_CONFIG_DIR",
  "INTELLIZEN_WORKER_CAPABILITY_URL",
  "INTELLIZEN_WORKER_CAPABILITY_TOKEN",
]);

const FORBIDDEN_WORKER_ENV_NAME =
  /^(?:SUPABASE_|VITE_SUPABASE_|VITE_INTELLIZEN_|OPENAI_|ANTHROPIC_|CLAUDE_|HERMES_|GITHUB_|NOTION_|GOOGLE_|TELEGRAM_|BWS_)|(?:_API_KEY|_ACCESS_TOKEN|_AUTH_TOKEN|_WEBHOOK_SECRET|_SESSION_TOKEN)$/i;

export function parseMcpPlane(args: string[]): McpPlane {
  const inline = args.find((argument) => argument.startsWith("--plane="));
  const flagIndex = args.indexOf("--plane");
  const value = inline?.slice("--plane=".length) ?? (flagIndex >= 0 ? args[flagIndex + 1] : undefined);
  const plane = value ?? "admin";

  if (plane !== "admin" && plane !== "worker") {
    throw new Error(`Unsupported MCP plane "${plane}". Expected admin or worker.`);
  }
  return plane;
}

export function filterToolsForPlane<T extends { name: string }>(
  tools: T[],
  plane: McpPlane,
): T[] {
  if (plane === "admin") return tools;
  return tools.filter((tool) => WORKER_TOOL_NAMES.has(tool.name));
}

export function assertWorkerPlaneEnvironment(
  environment: Record<string, string | undefined>,
) {
  const forbidden = Object.keys(environment)
    .filter((name) => !WORKER_ENV_EXEMPTIONS.has(name))
    .filter((name) => FORBIDDEN_WORKER_ENV_NAME.test(name))
    .sort();

  if (forbidden.length > 0) {
    throw new Error(
      `Worker-plane environment rejected forbidden names: ${forbidden.join(", ")}.`,
    );
  }
}

export function readWorkerBrokerConfig(
  environment: Record<string, string | undefined>,
) {
  const rawUrl = environment.INTELLIZEN_WORKER_CAPABILITY_URL?.trim();
  const token = environment.INTELLIZEN_WORKER_CAPABILITY_TOKEN?.trim();
  if (!rawUrl || !token) {
    throw new Error(
      "Worker plane requires a host-mediated capability URL and per-run token.",
    );
  }
  if (token.length < 32) {
    throw new Error("Worker capability token must contain at least 32 characters.");
  }

  const url = new URL(rawUrl);
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "::1"].includes(url.hostname)) {
    throw new Error("Worker capability broker must use an HTTP loopback address.");
  }
  return { url: url.toString(), token };
}

export function assertGenericRecordMutationAllowed(input: {
  databaseId: string;
  operation: "create" | "update" | "relation";
  fieldIds?: string[];
  relationFieldId?: string | null;
}) {
  const protectedFields = PROTECTED_FIELDS.get(input.databaseId);
  if (!protectedFields) return;

  const touched = new Set(input.fieldIds ?? []);
  if (input.relationFieldId) touched.add(input.relationFieldId);
  const rejected = [...touched].filter((fieldId) => protectedFields.has(fieldId)).sort();
  if (rejected.length === 0) return;

  throw new Error(
    `Protected field mutation rejected for fields: ${rejected.join(", ")}. ` +
      "Use propose_roster_change or the workflow transition RPC.",
  );
}

export function assertRosterProposalPatch(input: {
  databaseId: string;
  fieldPatch: Record<string, unknown>;
}) {
  const protectedFields = PROTECTED_FIELDS.get(input.databaseId);
  if (!protectedFields || input.databaseId === ROSTER_DATABASE_IDS.workflowRuns) {
    throw new Error("Roster proposals must target Roles, Agents, or Role Assignments.");
  }

  const fields = Object.keys(input.fieldPatch).sort();
  if (fields.length === 0 || fields.some((fieldId) => !protectedFields.has(fieldId))) {
    throw new Error("Roster proposals may contain protected roster fields only.");
  }
  assertPersistenceSafe(input.fieldPatch);
}

export function buildRosterChangeProposalPreview(input: {
  databaseId: string;
  recordId: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  reason: string;
}) {
  assertPersistenceSafe(input);
  return dryRunPreview(
    "propose_roster_change",
    "create a Needs approval roster-change record without applying it",
    {
      target_database_id: input.databaseId,
      target_record_id: input.recordId,
      before: input.before,
      after: input.after,
      reason: input.reason,
      applies_change: false,
    },
  );
}

