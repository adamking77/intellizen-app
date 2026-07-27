#!/usr/bin/env -S node --experimental-strip-types
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { validateWorkflowDefinition } from "../src/lib/workflow-schema.ts";
import type { WorkflowDefinitionV1 } from "../src/lib/workflow-schema.ts";

const confirmWrite = process.argv.includes("--confirm-write");
const envText = await readFile(new URL("../.env.local", import.meta.url), "utf8");
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .filter((line) => line && !line.trimStart().startsWith("#"))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1).replace(/^['"]|['"]$/g, "")];
    }),
);
const url = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("Gate 6 pattern registration configuration is incomplete.");
const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const registryId = "c1000000-0000-0000-0000-000000000001";
const common = {
  workflow_status: "Draft",
  workflow_entity: "genzen",
  workflow_default_actor: null,
  workflow_source_document_id: null,
  workflow_required_inputs: "Pattern inputs are declared in schema v1.",
  workflow_related_databases: [],
  workflow_receipt_template: "Every transition must emit a durable workspace.work_events receipt.",
  workflow_success_criteria: "Definition validates and dry-run dispatches nothing.",
  workflow_failure_behavior: "Block visibly; never fall through to another role.",
  workflow_definition_version: 1,
  workflow_runs: [],
};

type WorkflowPattern = {
  id: string;
  receiptId: string;
  workflowId: string;
  name: string;
  ownerRole: string;
  approvalGates: string | null;
  output: string;
  definition: WorkflowDefinitionV1;
};

const patterns: WorkflowPattern[] = [
  {
    id: "c1600000-0000-0000-0000-000000000001",
    receiptId: "c16e0000-0000-0000-0000-000000000001",
    workflowId: "pattern-role-handoff",
    name: "Pattern · Role handoff",
    ownerRole: "operations_director",
    approvalGates: null,
    output: "A bounded internal handoff artifact.",
    definition: {
      schema: "intellizen.workflow/1",
      id: "pattern-role-handoff",
      name: "Pattern · Role handoff",
      version: 1,
      trigger: { kind: "manual" },
      inputs: [],
      steps: [
        {
          id: "coordinate",
          kind: "role-assign",
          title: "Coordinate the handoff",
          role: "operations_director",
          resolution: "primary-active-occupant",
          agentOverride: null,
          overrideReason: null,
          modelOverride: null,
          instructions: "Prepare a bounded handoff for the Chief Engineer.",
          contextRefs: [],
          execution: "durable",
          mediatedAuthority: "draft-only",
          verification: { required: false, method: null },
          timeoutMinutes: 20,
          next: "build",
        },
        {
          id: "build",
          kind: "role-assign",
          title: "Complete the bounded work",
          role: "chief_engineer",
          resolution: "primary-active-occupant",
          agentOverride: null,
          overrideReason: null,
          modelOverride: null,
          instructions: "Complete the bounded handoff and return a structured result.",
          contextRefs: ["steps.coordinate.result"],
          execution: "ephemeral",
          mediatedAuthority: "local-write",
          verification: { required: false, method: null },
          timeoutMinutes: 30,
          next: "artifact",
        },
        {
          id: "artifact",
          kind: "artifact",
          title: "Create internal artifact",
          action: "create-doc",
          template: "internal-note",
          payloadRef: "steps.build.result",
          next: null,
        },
      ],
    },
  },
  {
    id: "c1600000-0000-0000-0000-000000000002",
    receiptId: "c16e0000-0000-0000-0000-000000000002",
    workflowId: "pattern-founder-approval",
    name: "Pattern · Founder-approved artifact",
    ownerRole: "operations_director",
    approvalGates: "founder_approval_authority",
    output: "An internal artifact created only after exact payload approval.",
    definition: {
      schema: "intellizen.workflow/1",
      id: "pattern-founder-approval",
      name: "Pattern · Founder-approved artifact",
      version: 1,
      trigger: { kind: "manual" },
      inputs: [],
      steps: [
        {
          id: "draft",
          kind: "role-assign",
          title: "Draft the payload",
          role: "operations_director",
          resolution: "primary-active-occupant",
          agentOverride: null,
          overrideReason: null,
          modelOverride: null,
          instructions: "Draft the exact bounded payload for founder review.",
          contextRefs: [],
          execution: "durable",
          mediatedAuthority: "draft-only",
          verification: { required: false, method: null },
          timeoutMinutes: 20,
          next: "approve",
        },
        {
          id: "approve",
          kind: "approval",
          title: "Founder approval",
          gate: "founder_approval_authority",
          payloadRef: "steps.draft.result",
          next: "artifact",
        },
        {
          id: "artifact",
          kind: "artifact",
          title: "Create approved internal artifact",
          action: "create-doc",
          template: "approved-internal-note",
          payloadRef: "steps.draft.result",
          next: null,
        },
      ],
    },
  },
  {
    id: "c1600000-0000-0000-0000-000000000003",
    receiptId: "c16e0000-0000-0000-0000-000000000003",
    workflowId: "pattern-independent-verification",
    name: "Pattern · Independent verification",
    ownerRole: "operations_director",
    approvalGates: null,
    output: "A producing result plus a separately assigned verification receipt.",
    definition: {
      schema: "intellizen.workflow/1",
      id: "pattern-independent-verification",
      name: "Pattern · Independent verification",
      version: 1,
      trigger: { kind: "manual" },
      inputs: [],
      steps: [
        {
          id: "produce",
          kind: "role-assign",
          title: "Produce the result",
          role: "operations_director",
          resolution: "primary-active-occupant",
          agentOverride: null,
          overrideReason: null,
          modelOverride: null,
          instructions: "Produce the bounded result to be verified.",
          contextRefs: [],
          execution: "durable",
          mediatedAuthority: "draft-only",
          verification: { required: true, method: "verifier-step:verify" },
          timeoutMinutes: 20,
          next: "verify",
        },
        {
          id: "verify",
          kind: "role-assign",
          title: "Verify independently",
          role: "verifier",
          resolution: "explicit-agent-override",
          agentOverride: "keel",
          overrideReason: "Use the approved local Keel binding as the explicit verifier for this pattern.",
          modelOverride: null,
          instructions: "Verify the producing result against the supplied evidence and return passed, failed, or inconclusive.",
          contextRefs: ["steps.produce.result"],
          execution: "ephemeral",
          mediatedAuthority: "read-only",
          verification: { required: false, method: null },
          timeoutMinutes: 20,
          next: "artifact",
        },
        {
          id: "artifact",
          kind: "artifact",
          title: "Record verified artifact",
          action: "create-doc",
          template: "verification-note",
          payloadRef: "steps.verify.result",
          next: null,
        },
      ],
    },
  },
  {
    id: "c1600000-0000-0000-0000-000000000004",
    receiptId: "c16e0000-0000-0000-0000-000000000004",
    workflowId: "pattern-coordinator-specialist",
    name: "Pattern · Coordinator to specialist",
    ownerRole: "operations_director",
    approvalGates: null,
    output: "A specialist result synthesized by the coordinating role.",
    definition: {
      schema: "intellizen.workflow/1",
      id: "pattern-coordinator-specialist",
      name: "Pattern · Coordinator to specialist",
      version: 1,
      trigger: { kind: "manual" },
      inputs: [],
      steps: [
        {
          id: "coordinate",
          kind: "role-assign",
          title: "Plan the bounded assignment",
          role: "operations_director",
          resolution: "primary-active-occupant",
          agentOverride: null,
          overrideReason: null,
          modelOverride: null,
          instructions: "Plan one bounded specialist assignment and state its acceptance evidence.",
          contextRefs: [],
          execution: "durable",
          mediatedAuthority: "draft-only",
          verification: { required: false, method: null },
          timeoutMinutes: 20,
          next: "specialist",
        },
        {
          id: "specialist",
          kind: "role-assign",
          title: "Complete specialist work",
          role: "chief_engineer",
          resolution: "primary-active-occupant",
          agentOverride: null,
          overrideReason: null,
          modelOverride: null,
          instructions: "Complete the bounded assignment and return result plus evidence.",
          contextRefs: ["steps.coordinate.result"],
          execution: "ephemeral",
          mediatedAuthority: "local-write",
          verification: { required: false, method: null },
          timeoutMinutes: 30,
          next: "synthesize",
        },
        {
          id: "synthesize",
          kind: "role-assign",
          title: "Synthesize the result",
          role: "operations_director",
          resolution: "primary-active-occupant",
          agentOverride: null,
          overrideReason: null,
          modelOverride: null,
          instructions: "Synthesize the specialist result without expanding its claims.",
          contextRefs: ["steps.specialist.result"],
          execution: "durable",
          mediatedAuthority: "draft-only",
          verification: { required: false, method: null },
          timeoutMinutes: 20,
          next: "artifact",
        },
        {
          id: "artifact",
          kind: "artifact",
          title: "Create synthesis artifact",
          action: "create-doc",
          template: "internal-note",
          payloadRef: "steps.synthesize.result",
          next: null,
        },
      ],
    },
  },
];

for (const pattern of patterns) {
  const validation = validateWorkflowDefinition(pattern.definition);
  if (!validation.valid) {
    throw new Error(
      `Pattern ${pattern.workflowId} failed the canonical validator: ${validation.errors
        .map((error) => `${error.path}: ${error.message}`)
        .join("; ")}`,
    );
  }
}

const ids = patterns.map((pattern) => pattern.id);
const { data: existing, error: readError } = await supabase
  .schema("workspace")
  .from("records")
  .select("id, fields")
  .in("id", ids);
if (readError) throw new Error(readError.message);
const existingById = new Map((existing ?? []).map((record) => [record.id, record]));
const missing = patterns.filter((pattern) => !existingById.has(pattern.id));
const mismatches = patterns.filter((pattern) => {
  const record = existingById.get(pattern.id);
  return record && record.fields.workflow_id !== pattern.workflowId;
});
if (mismatches.length) {
  throw new Error(`Pattern ID collision: ${mismatches.map((pattern) => pattern.id).join(", ")}`);
}

const { data: existingReceipts, error: receiptReadError } = await supabase
  .schema("workspace")
  .from("work_events")
  .select("id, record_id")
  .in("id", patterns.map((pattern) => pattern.receiptId));
if (receiptReadError) throw new Error(receiptReadError.message);
const existingReceiptById = new Map(
  (existingReceipts ?? []).map((receipt) => [receipt.id, receipt]),
);
const missingReceipts = patterns.filter(
  (pattern) => !existingReceiptById.has(pattern.receiptId),
);
const receiptMismatches = patterns.filter((pattern) => {
  const receipt = existingReceiptById.get(pattern.receiptId);
  return receipt && receipt.record_id !== pattern.id;
});
if (receiptMismatches.length) {
  throw new Error(
    `Pattern receipt ID collision: ${receiptMismatches
      .map((pattern) => pattern.receiptId)
      .join(", ")}`,
  );
}

const preview = {
  dry_run: !confirmWrite,
  write_performed: false,
  existing: patterns.length - missing.length,
  to_create: missing.map((pattern) => ({
    id: pattern.id,
    workflow_id: pattern.workflowId,
    status: "Draft",
    definition_version: 1,
    step_count: pattern.definition.steps.length,
  })),
  receipts_to_create: missingReceipts.map((pattern) => ({
    id: pattern.receiptId,
    record_id: pattern.id,
    event_kind: "workflow.pattern_registered",
  })),
};
if (!confirmWrite) {
  process.stdout.write(`${JSON.stringify(preview, null, 2)}\n`);
  process.exit(0);
}

const rows = missing.map((pattern) => ({
  id: pattern.id,
  database_id: registryId,
  entity: "genzen",
  fields: {
    ...common,
    workflow_name: pattern.name,
    workflow_id: pattern.workflowId,
    workflow_owner_role: pattern.ownerRole,
    workflow_source_path: `intellizen://workflow-patterns/${pattern.workflowId}`,
    workflow_trigger: "manual",
    workflow_default_routing: pattern.ownerRole,
    workflow_approval_gates: pattern.approvalGates,
    workflow_expected_output: pattern.output,
    workflow_definition: pattern.definition,
  },
  body: `# ${pattern.name}\n\nDraft schema-v1 pattern. Review and activate explicitly before operational use.`,
  taxonomy: {
    entity: "genzen",
    area: "operations",
    object_type: "workflow_pattern",
  },
}));
if (rows.length > 0) {
  const { error: insertError } = await supabase
    .schema("workspace")
    .from("records")
    .insert(rows);
  if (insertError) throw new Error(insertError.message);
}

if (missingReceipts.length > 0) {
  const { error: receiptInsertError } = await supabase
    .schema("workspace")
    .from("work_events")
    .insert(
      missingReceipts.map((pattern) => ({
        id: pattern.receiptId,
        record_id: pattern.id,
        event_kind: "workflow.pattern_registered",
        actor: "keel",
        durable_role: "chief_engineer",
        summary: `Registered Draft workflow pattern ${pattern.workflowId}.`,
        idempotency_key: `gate6:pattern:${pattern.workflowId}:registered:v1`,
        payload: {
          workflow_id: pattern.workflowId,
          status: "Draft",
          schema: pattern.definition.schema,
          definition_version: pattern.definition.version,
          approval_required_for_activation: true,
        },
      })),
    );
  if (receiptInsertError) throw new Error(receiptInsertError.message);
}

const { data: verified, error: verifyError } = await supabase
  .schema("workspace")
  .from("records")
  .select("id, fields")
  .in("id", patterns.map((pattern) => pattern.id));
if (verifyError) throw new Error(verifyError.message);
const { data: verifiedReceipts, error: receiptVerifyError } = await supabase
  .schema("workspace")
  .from("work_events")
  .select("id, record_id, event_kind, actor, durable_role")
  .in("id", patterns.map((pattern) => pattern.receiptId));
if (receiptVerifyError) throw new Error(receiptVerifyError.message);
process.stdout.write(`${JSON.stringify({
  dry_run: false,
  write_performed: missing.length > 0 || missingReceipts.length > 0,
  created: verified?.map((record) => ({
    id: record.id,
    workflow_id: record.fields.workflow_id,
    status: record.fields.workflow_status,
    definition_version: record.fields.workflow_definition_version,
  })) ?? [],
  receipts: verifiedReceipts ?? [],
}, null, 2)}\n`);
