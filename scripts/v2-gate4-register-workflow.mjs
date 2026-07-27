import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "../mcp-server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js";
import { StdioClientTransport } from "../mcp-server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js";
import {
  dryRunWorkflowDefinition,
  validateWorkflowDefinition,
} from "../shared/workflow-schema.mjs";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const definitionPath = join(
  projectRoot,
  "build-plans/evidence/v2-gate4-proof-workflow.json",
);
const confirmWrite = process.argv.includes("--confirm-write");
const definition = JSON.parse(await readFile(definitionPath, "utf8"));
const validation = validateWorkflowDefinition(definition);
if (!validation.valid) {
  throw new Error(
    `Gate 4 proof definition is invalid: ${JSON.stringify(validation.errors)}`,
  );
}

const roleResolutions = {
  operations_director: {
    role: "operations_director",
    roleStatus: "active",
    agent: "fiona",
    agentStatus: "active",
    bindingRef: "hermes-fiona",
    adapterId: "hermes",
    authReady: true,
    execution: "durable",
    resolution: "primary-active-occupant",
  },
  chief_engineer: {
    role: "chief_engineer",
    roleStatus: "active",
    agent: "keel",
    agentStatus: "active",
    bindingRef: "codex-local-primary",
    adapterId: "codex-cli",
    authReady: true,
    execution: "ephemeral",
    resolution: "primary-active-occupant",
  },
  verifier: {
    role: "verifier",
    roleStatus: "active",
    agent: "keel",
    agentStatus: "active",
    bindingRef: "codex-local-primary",
    adapterId: "codex-cli",
    authReady: true,
    execution: "ephemeral",
    resolution: "explicit-agent-override",
  },
};
const dryRun = dryRunWorkflowDefinition({
  definition,
  roleResolutions,
  knownApprovalRoles: ["founder_approval_authority"],
});
if (!dryRun.valid || dryRun.dispatches !== false) {
  throw new Error(`Gate 4 dry run failed: ${JSON.stringify(dryRun.errors)}`);
}

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [join(projectRoot, "mcp-server/dist/index.js"), "--plane", "admin"],
  cwd: projectRoot,
  stderr: "pipe",
});
const client = new Client({
  name: "intellizen-gate4-register-workflow",
  version: "1.0.0",
});

function toolJson(response) {
  const text = response.content.find((item) => item.type === "text")?.text;
  if (!text) throw new Error("MCP tool returned no text payload.");
  return JSON.parse(text);
}

try {
  await client.connect(transport);
  const current = toolJson(
    await client.callTool({
      name: "list_workflows",
      arguments: { include_inactive: true, limit: 200 },
    }),
  );
  const existing = current.find(
    (workflow) => workflow.workflow_id === definition.id,
  );
  if (existing) {
    const currentDefinition = toolJson(
      await client.callTool({
        name: "get_workflow_definition",
        arguments: { workflow_id: definition.id },
      }),
    );
    const currentVersion = Number(currentDefinition.definition_version ?? 0);
    const unchanged =
      JSON.stringify(currentDefinition.definition) === JSON.stringify(definition);
    if (unchanged) {
      console.log(
        JSON.stringify(
          {
            result: "passed",
            mode: confirmWrite ? "confirmed-noop" : "preview",
            dispatches: false,
            existing_workflow_record_id: existing.id,
            definition_version: currentVersion,
            validation,
            dry_run: dryRun,
          },
          null,
          2,
        ),
      );
    } else if (definition.version <= currentVersion) {
      throw new Error(
        `Gate 4 definition must increment beyond stored version ${currentVersion}.`,
      );
    } else {
      const update = toolJson(
        await client.callTool({
          name: "update_record",
          arguments: {
            record_id: existing.id,
            fields: {
              workflow_definition: JSON.stringify(definition),
              workflow_definition_version: definition.version,
              workflow_expected_output:
                "Inspectable role-directed proof with a simulated consequential action",
              workflow_success_criteria:
                "Distinct assignment verification, exact payload approval, complete receipts",
              workflow_failure_behavior:
                "Block visibly; never fall through or perform an unapproved action",
            },
            body_section: `## Definition Version ${definition.version}\n\nUpdated the Gate 4 proof task so independent verification evaluates conformance of the requested internal draft, not unrequested external execution evidence.`,
            actor: "Keel",
            durable_role: "chief_engineer",
            summary: `Updated Gate 4 proof workflow definition to version ${definition.version}`,
            confirm_write: confirmWrite,
          },
        }),
      );
      if (!confirmWrite) {
        if (update.dry_run !== true || !String(update.message).includes("DRY RUN")) {
          throw new Error("Gate 4 update preview did not preserve the no-write contract.");
        }
        console.log(
          JSON.stringify(
            {
              result: "passed",
              mode: "preview-update",
              dispatches: false,
              workflow_record_id: existing.id,
              from_version: currentVersion,
              to_version: definition.version,
              validation,
              dry_run: dryRun,
              update_preview: update,
            },
            null,
            2,
          ),
        );
      } else {
        const readback = toolJson(
          await client.callTool({
            name: "get_workflow_definition",
            arguments: { workflow_id: definition.id },
          }),
        );
        if (
          readback.workflow_record_id !== existing.id ||
          readback.validation?.valid !== true ||
          readback.definition_version !== definition.version ||
          JSON.stringify(readback.definition) !== JSON.stringify(definition)
        ) {
          throw new Error("Gate 4 workflow update readback did not match version 2.");
        }
        console.log(
          JSON.stringify(
            {
              result: "passed",
              mode: "confirmed-update",
              workflow_record_id: existing.id,
              from_version: currentVersion,
              definition_version: readback.definition_version,
              validation: readback.validation,
            },
            null,
            2,
          ),
        );
      }
    }
  } else {
    const create = toolJson(
      await client.callTool({
        name: "create_record",
        arguments: {
          database_id: "c1000000-0000-0000-0000-000000000001",
          entity: "genzen",
          fields: {
            workflow_name: definition.name,
            workflow_id: definition.id,
            workflow_status: "Active",
            workflow_entity: "IntelliZen",
            workflow_owner_role: "operations_director",
            workflow_default_actor: "Fiona",
            workflow_trigger: "manual",
            workflow_required_inputs: "build_scope",
            workflow_default_routing:
              "operations_director -> chief_engineer -> verifier -> founder_approval_authority",
            workflow_approval_gates: "founder_approval_authority",
            workflow_expected_output:
              "Inspectable role-directed proof with a simulated consequential action",
            workflow_success_criteria:
              "Distinct assignment verification, exact payload approval, complete receipts",
            workflow_failure_behavior:
              "Block visibly; never fall through or perform an unapproved action",
            workflow_definition: JSON.stringify(definition),
            workflow_definition_version: definition.version,
            workflow_runs: [],
          },
          body:
            "# V2 Gate 4 role-directed proof\n\nInternal build-verification workflow. It performs no external human-visible action. Its terminal artifact is a safe simulation.",
          taxonomy: {
            entity: "genzen",
            area: "engineering",
            object_type: "workflow",
            proof_gate: "4",
          },
          actor: "Keel",
          durable_role: "chief_engineer",
          summary: "Registered the reviewed IntelliZen V2 Gate 4 proof workflow",
          confirm_write: confirmWrite,
        },
      }),
    );
    if (!confirmWrite) {
      if (create.dry_run !== true || !String(create.message).includes("DRY RUN")) {
        throw new Error("Gate 4 create preview did not preserve the no-write contract.");
      }
      console.log(
        JSON.stringify(
          {
            result: "passed",
            mode: "preview",
            dispatches: false,
            validation,
            dry_run: dryRun,
            create_preview: create,
          },
          null,
          2,
        ),
      );
    } else {
      const readback = toolJson(
        await client.callTool({
          name: "get_workflow_definition",
          arguments: { workflow_id: definition.id },
        }),
      );
      if (
        readback.workflow_record_id !== create.record?.id ||
        readback.validation?.valid !== true ||
        readback.definition_version !== definition.version
      ) {
        throw new Error("Gate 4 workflow readback did not match the created record.");
      }
      console.log(
        JSON.stringify(
          {
            result: "passed",
            mode: "confirmed",
            workflow_record_id: create.record.id,
            definition_version: readback.definition_version,
            validation: readback.validation,
          },
          null,
          2,
        ),
      );
    }
  }
} finally {
  await client.close();
}
