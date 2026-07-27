// @ts-nocheck -- live Node harness is executed by Vitest, not the browser build.
import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { Client } from "../../mcp-server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js";
import { StdioClientTransport } from "../../mcp-server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js";

import type {
  WorkflowDefinitionV1,
  WorkflowRoleAssignStep,
} from "../lib/workflow-schema";
import {
  runWorkflow,
  type ResolvedWorkflowRole,
  type WorkflowRunnerPort,
  type WorkflowTransitionRequest,
} from "./workflow-runner";

const execFileAsync = promisify(execFile);
const projectRoot = "/Users/adamking/projects/intellizen-app";
const runLive = process.env.RUN_GATE4_LIVE === "1";
const liveIt = runLive ? it : it.skip;

function parseEnv(contents: string) {
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

function toolJson(response: Awaited<ReturnType<Client["callTool"]>>) {
  const text = response.content.find((item) => item.type === "text")?.text;
  if (!text) throw new Error("MCP tool returned no text.");
  return JSON.parse(text) as Record<string, unknown>;
}

async function runProgram(
  binary: string,
  args: string[],
  options: {
    cwd: string;
    env: Record<string, string>;
    stdin?: string;
    timeoutMs?: number;
  },
) {
  return new Promise<{ code: number; stdout: string; stderr: string }>(
    (resolve, reject) => {
      const child = spawn(binary, args, {
        cwd: options.cwd,
        env: options.env,
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8").on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.setEncoding("utf8").on("data", (chunk) => {
        stderr += chunk;
      });
      const timeout = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error(`Program timed out: ${binary}`));
      }, options.timeoutMs ?? 300_000);
      child.on("error", reject);
      child.on("close", (code) => {
        clearTimeout(timeout);
        resolve({ code: code ?? -1, stdout, stderr });
      });
      child.stdin.end(options.stdin ?? "");
    },
  );
}

async function startRejectingCapabilityBroker(token: string) {
  const calls: unknown[] = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    let payload: unknown = null;
    try {
      payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      response.writeHead(400).end();
      return;
    }
    calls.push(payload);
    if (request.headers.authorization !== `Bearer ${token}`) {
      response.writeHead(401).end();
      return;
    }
    response.writeHead(403).end();
  });
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", resolve),
  );
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Capability broker did not bind a TCP port.");
  }
  return {
    calls,
    url: `http://127.0.0.1:${address.port}/capability`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

function parseJsonResult(text: string) {
  const trimmed = text.trim();
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(unfenced) as unknown;
  } catch {
    return { text: trimmed };
  }
}

async function startSchemaRun(definition: WorkflowDefinitionV1) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(projectRoot, "mcp-server/dist/index.js"), "--plane", "admin"],
    cwd: projectRoot,
    stderr: "pipe",
  });
  const client = new Client({
    name: "intellizen-gate4-live-proof",
    version: "1.0.0",
  });
  await client.connect(transport);
  try {
    const request = {
      workflow_id: definition.id,
      trigger_source: "mcp",
      requested_by: "Adam",
      entity_scope: "IntelliZen",
      context: {
        proof_key: "v2-gate4-live-role-directed",
        build_scope:
          "Create a descriptive internal acceptance checklist for the Gate 4 runner contract. This is draft-only; do not execute tests or perform external action.",
      },
      config: {
        external_actions_allowed: false,
        simulated_consequential_action_only: true,
      },
    };
    const preview = toolJson(
      await client.callTool({
        name: "start_workflow",
        arguments: { ...request, confirm_write: false },
      }),
    );
    expect(preview.dry_run).toBe(true);
    expect(String(preview.message)).toContain("DRY RUN");
    const confirmed = toolJson(
      await client.callTool({
        name: "start_workflow",
        arguments: { ...request, confirm_write: true },
      }),
    );
    const run = confirmed.run as {
      id: string;
      schema_version: string;
      current_step_id: string;
      run_version: number;
    };
    expect(run.schema_version).toBe("intellizen.workflow/1");
    expect(run.current_step_id).toBe(definition.steps[0].id);
    expect(run.run_version).toBe(0);
    return run;
  } finally {
    await client.close();
  }
}

async function loadRoleResolutions(
  supabase: ReturnType<typeof createClient>,
  binding: {
    bindingId: string;
    adapterId: string;
    canonicalBinary: string;
    argTemplates: string[];
    workerProfileHome: string;
  },
) {
  const databaseIds = [
    "c1000000-0000-0000-0000-000000000003",
    "c1000000-0000-0000-0000-000000000004",
    "c1000000-0000-0000-0000-000000000005",
  ];
  const { data, error } = await supabase
    .schema("workspace")
    .from("records")
    .select("id,database_id,fields")
    .in("database_id", databaseIds);
  if (error) throw new Error(error.message);
  const records = data ?? [];
  const roles = new Map(
    records
      .filter((record) => record.database_id === databaseIds[0])
      .map((record) => [record.fields.role_key as string, record]),
  );
  const agents = new Map(
    records
      .filter((record) => record.database_id === databaseIds[1])
      .map((record) => [record.fields.agent_key as string, record]),
  );
  const assignments = records.filter(
    (record) =>
      record.database_id === databaseIds[2] &&
      record.fields.role_assignment_status === "active",
  );
  const assignmentForRole = (roleId: string) =>
    assignments.find(
      (assignment) => assignment.fields.role_assignment_role?.[0] === roleId,
    );
  const assignmentForAgent = (agentId: string) =>
    assignments.find(
      (assignment) =>
        assignment.fields.role_assignment_agent?.[0] === agentId &&
        assignment.fields.role_assignment_binding_ref,
    );

  return (step: WorkflowRoleAssignStep): ResolvedWorkflowRole | null => {
    const role = roles.get(step.role);
    if (!role || role.fields.role_status !== "active") return null;
    let assignment = assignmentForRole(role.id);
    let agent =
      assignment &&
      [...agents.values()].find(
        (candidate) =>
          candidate.id === assignment?.fields.role_assignment_agent?.[0],
      );
    if (step.resolution === "explicit-agent-override") {
      agent = agents.get(step.agentOverride ?? "");
      assignment = agent ? assignmentForAgent(agent.id) : undefined;
    }
    if (!agent || agent.fields.agent_status !== "active") return null;

    if (step.role === "operations_director") {
      return {
        role: step.role,
        roleRecordId: role.id,
        roleAuthorityCeiling: role.fields.role_authority_ceiling,
        ownerGate: role.fields.role_owner_gate,
        delegationPolicy: role.fields.role_delegation_policy,
        verificationEligible: role.fields.role_verification_eligible === true,
        agent: agent.fields.agent_key,
        agentRecordId: agent.id,
        bindingRef: "hermes-fiona",
        adapterId: "hermes",
        resolvedModel: null,
        execution: "durable",
        providerAuthority: "Fiona Hermes profile and API run controls",
        unmanagedAuthority: "Hermes host process and current macOS user",
      } as ResolvedWorkflowRole;
    }
    if (
      assignment?.fields.role_assignment_binding_ref !== binding.bindingId ||
      binding.adapterId !== "codex-cli"
    ) {
      return null;
    }
    return {
      role: step.role,
      roleRecordId: role.id,
      roleAuthorityCeiling: role.fields.role_authority_ceiling,
      ownerGate: role.fields.role_owner_gate,
      delegationPolicy: role.fields.role_delegation_policy,
      verificationEligible: role.fields.role_verification_eligible === true,
      agent: agent.fields.agent_key,
      agentRecordId: agent.id,
      bindingRef: binding.bindingId,
      adapterId: "codex-cli",
      resolvedModel: null,
      execution: "ephemeral",
      providerAuthority: "Codex workspace-write sandbox and worker-only profile",
      unmanagedAuthority: "Current macOS user outside the provider sandbox",
    } as ResolvedWorkflowRole;
  };
}

describe("Gate 4 live role-directed proof", () => {
  liveIt(
    "reaches an exact payload-bound founder approval through real Hermes and Codex assignments",
    async () => {
      const env = parseEnv(await readFile(join(projectRoot, ".env.local"), "utf8"));
      const supabaseUrl =
        env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
      const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
      const hermesUrl = env.VITE_HERMES_API_URL?.replace(/\/$/, "");
      const hermesKey = env.VITE_HERMES_API_KEY;
      if (!supabaseUrl || !serviceKey || !hermesUrl || !hermesKey) {
        throw new Error("Gate 4 live proof configuration is incomplete.");
      }
      const definition = JSON.parse(
        await readFile(
          join(
            projectRoot,
            "build-plans/evidence/v2-gate4-proof-workflow.json",
          ),
          "utf8",
        ),
      ) as WorkflowDefinitionV1;
      const bindingsStore = JSON.parse(
        await readFile(
          "/Users/adamking/Library/Application Support/IntelliZen/runtime-bindings.json",
          "utf8",
        ),
      ) as {
        bindings: Array<{
          bindingId: string;
          adapterId: string;
          canonicalBinary: string;
          argTemplates: string[];
          workerProfileHome: string;
        }>;
      };
      const binding = bindingsStore.bindings.find(
        (candidate) => candidate.bindingId === "codex-local-primary",
      );
      if (!binding) throw new Error("codex-local-primary binding is missing.");
      const supabase = createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const resolveRole = await loadRoleResolutions(supabase, binding);
      const run = await startSchemaRun(definition);
      let runVersion = run.run_version;
      let fencingToken = 0;

      const port: WorkflowRunnerPort = {
        now: () => new Date().toISOString(),
        newId: () => randomUUID(),
        acquireLease: async (input) => {
          const { data, error } = await supabase
            .schema("workspace")
            .rpc("acquire_workflow_dispatch_lease", {
              p_workflow_run_id: input.runId,
              p_expected_run_version: input.expectedRunVersion,
              p_dispatcher_session: input.dispatcherSession,
              p_lease_ttl_seconds: 300,
              p_idempotency_key: input.idempotencyKey,
              p_request_hash: input.requestHash,
              p_actor: input.actor,
            });
          if (error) throw new Error(error.message);
          runVersion = data.run_version;
          fencingToken = data.fencing_token;
          return { runVersion, fencingToken };
        },
        transition: async (input: WorkflowTransitionRequest) => {
          const { data, error } = await supabase
            .schema("workspace")
            .rpc("transition_workflow_step", {
              p_workflow_run_id: input.runId,
              p_expected_run_version: input.expectedRunVersion,
              p_expected_step_id: input.expectedStepId,
              p_expected_step_state: input.expectedStepState,
              p_next_step_id: input.nextStepId,
              p_next_step_state: input.nextStepState,
              p_next_run_status: input.nextRunStatus,
              p_dispatcher_session: input.dispatcherSession,
              p_fencing_token: input.fencingToken,
              p_idempotency_key: input.idempotencyKey,
              p_request_hash: input.requestHash,
              p_actor: input.actor,
              p_event_kind: input.eventKind,
              p_event_summary: input.eventSummary,
              p_event_payload: input.eventPayload,
              p_approval_mutation: input.approvalMutation ?? null,
            });
          if (error) throw new Error(error.message);
          runVersion = data.run_version;
          return { runVersion, fencingToken: data.fencing_token };
        },
        releaseLease: async (input) => {
          const { data, error } = await supabase
            .schema("workspace")
            .rpc("release_workflow_dispatch_lease", {
              p_workflow_run_id: input.runId,
              p_dispatcher_session: input.dispatcherSession,
              p_fencing_token: input.fencingToken,
              p_actor: input.actor,
              p_idempotency_key: input.idempotencyKey,
              p_request_hash: input.requestHash,
            });
          if (error) throw new Error(error.message);
          runVersion = data.run_version;
          return { runVersion };
        },
        resolveRole: async (step) => resolveRole(step),
        dispatch: async ({ step, assignment, renderedContext }) => {
          if (step.role === "operations_director") {
            const response = await fetch(`${hermesUrl}/v1/runs`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${hermesKey}`,
              },
              body: JSON.stringify({
                input: [
                  renderedContext,
                  "",
                  "Return only compact JSON with keys coordination, constraints, and handoff.",
                  "Do not use tools. Do not send, publish, deploy, or contact anyone.",
                ].join("\n"),
                instructions:
                  "You are Fiona in an internal IntelliZen build proof. Stay draft-only.",
              }),
              signal: AbortSignal.timeout(10_000),
            });
            const started = (await response.json()) as {
              run_id?: string;
              status?: string;
            };
            if (!response.ok || !started.run_id) {
              throw new Error(`Hermes run start failed (${response.status}).`);
            }
            for (let attempt = 0; attempt < 180; attempt += 1) {
              await new Promise((resolve) => setTimeout(resolve, 1_000));
              const statusResponse = await fetch(
                `${hermesUrl}/v1/runs/${started.run_id}`,
                {
                  headers: { Authorization: `Bearer ${hermesKey}` },
                  signal: AbortSignal.timeout(5_000),
                },
              );
              const status = (await statusResponse.json()) as {
                status?: string;
                output?: string;
                error?: string;
                usage?: {
                  input_tokens?: number;
                  output_tokens?: number;
                };
              };
              if (status.status === "completed") {
                return {
                  sessionId: started.run_id,
                  result: parseJsonResult(status.output ?? ""),
                  usage: {
                    inputTokens: status.usage?.input_tokens ?? 0,
                    outputTokens: status.usage?.output_tokens ?? 0,
                  },
                };
              }
              if (
                ["failed", "cancelled", "waiting_for_approval"].includes(
                  status.status ?? "",
                )
              ) {
                throw new Error(
                  `Hermes run ended as ${status.status}: ${status.error ?? "no detail"}`,
                );
              }
            }
            throw new Error("Hermes run did not reach a terminal state.");
          }

          const assignmentDirectory = await mkdtemp(
            join(tmpdir(), `intellizen-gate4-${step.id}.`),
          );
          await execFileAsync("/usr/bin/git", ["init", "--quiet"], {
            cwd: assignmentDirectory,
          });
          await writeFile(
            join(assignmentDirectory, "README.md"),
            "# Gate 4 isolated assignment\n\nNo application source or credentials are present.\n",
          );
          await execFileAsync(
            "/usr/bin/git",
            [
              "-c",
              "user.name=IntelliZen Gate 4",
              "-c",
              "user.email=gate4@localhost",
              "add",
              "README.md",
            ],
            { cwd: assignmentDirectory },
          );
          await execFileAsync(
            "/usr/bin/git",
            [
              "-c",
              "user.name=IntelliZen Gate 4",
              "-c",
              "user.email=gate4@localhost",
              "commit",
              "--quiet",
              "-m",
              "fixture",
            ],
            { cwd: assignmentDirectory },
          );
          const capabilityToken = randomUUID();
          const broker = await startRejectingCapabilityBroker(capabilityToken);
          try {
            const prompt = [
              renderedContext,
              "",
              step.instructions,
              "",
              step.role === "verifier"
                ? 'Return only JSON: {"status":"passed|failed|inconclusive","method":"...","evidence":["..."],"notes":"..."}.'
                : 'Return only JSON: {"status":"completed","draft":"...","constraints":["..."]}.',
              "Do not call tools and do not modify files.",
            ].join("\n");
            const native = await runProgram(
              join(
                projectRoot,
                "src-tauri/target/debug/examples/runtime_probe",
              ),
              [],
              {
                cwd: assignmentDirectory,
                env: {
                  PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
                  LANG: "C.UTF-8",
                },
                stdin: JSON.stringify({
                  runId: assignment.assignmentId,
                  binary: binding.canonicalBinary,
                  args: [
                    "exec",
                    "--strict-config",
                    "--json",
                    "--ephemeral",
                    "--ignore-rules",
                    "--sandbox",
                    "workspace-write",
                    "-c",
                    'approval_policy="never"',
                    "-C",
                    assignmentDirectory,
                    "-",
                  ],
                  workingDirectory: assignmentDirectory,
                  stdin: prompt,
                  timeoutMs: step.timeoutMinutes * 60_000,
                  environment: {
                    CODEX_HOME: binding.workerProfileHome,
                    INTELLIZEN_WORKER_CAPABILITY_URL: broker.url,
                    INTELLIZEN_WORKER_CAPABILITY_TOKEN: capabilityToken,
                    NO_COLOR: "1",
                    TERM: "dumb",
                  },
                }),
                timeoutMs: step.timeoutMinutes * 60_000 + 10_000,
              },
            );
            if (native.code !== 0) {
              throw new Error(`Native Codex runner failed: ${native.stderr}`);
            }
            const nativeEvents = native.stdout
              .split(/\r?\n/)
              .filter(Boolean)
              .map((line) => JSON.parse(line) as Record<string, unknown>);
            const providerEvents = nativeEvents
              .filter(
                (event) =>
                  event.kind === "stdout" && typeof event.text === "string",
              )
              .map((event) => JSON.parse(event.text as string));
            const message = providerEvents
              .filter(
                (event) =>
                  event.type === "item.completed" &&
                  event.item?.type === "agent_message" &&
                  event.item.text,
              )
              .map((event) => event.item.text as string)
              .slice(-1)[0];
            const sessionId = providerEvents.find(
              (event) => event.type === "thread.started",
            )?.thread_id;
            const usage = providerEvents.find(
              (event) => event.type === "turn.completed",
            )?.usage;
            if (!message || !sessionId) {
              throw new Error("Codex live assignment did not return its terminal contract.");
            }
            const { stdout: status } = await execFileAsync(
              "/usr/bin/git",
              ["status", "--porcelain"],
              { cwd: assignmentDirectory },
            );
            if (status.trim() || broker.calls.length > 0) {
              throw new Error(
                "Codex live assignment changed files or called an ungranted capability.",
              );
            }
            return {
              sessionId,
              result: parseJsonResult(message),
              usage: {
                inputTokens: usage?.input_tokens ?? 0,
                outputTokens: usage?.output_tokens ?? 0,
              },
            };
          } finally {
            await broker.close();
          }
        },
        decideApproval: async () => null,
        performArtifact: async () => {
          throw new Error("The preapproval proof must not perform the artifact step.");
        },
      };

      const result = await runWorkflow(
        {
          runId: run.id,
          runVersion,
          actor: "Adam",
          definition,
          inputs: {
            build_scope:
              "Create a descriptive internal acceptance checklist for the Gate 4 runner contract. This is draft-only; do not execute tests or perform external action.",
          },
          sourceRecords: [
            "ad98b792-b31b-4f69-8cba-8b44893f134e",
          ],
          sourceTools: [],
          sourcePaths: [],
        },
        port,
      );
      expect(result.status).toBe("needs_approval");
      expect(result.verification[0]?.label).toBe(
        "independent agent verification",
      );
      expect(result.assignments.draft.assignmentId).not.toBe(
        result.assignments.verify.assignmentId,
      );
      expect(result.approvals.approve.decision).toBeNull();

      console.log(
        `GATE4_APPROVAL_REQUIRED ${JSON.stringify({
          run_id: run.id,
          run_version: result.runVersion,
          approval: result.approvals.approve,
          producing_assignment_id: result.assignments.draft.assignmentId,
          verifying_assignment_id: result.assignments.verify.assignmentId,
          verification: result.verification[0],
          external_action: false,
          simulated_action_only: true,
        })}`,
      );
    },
    900_000,
  );
});
