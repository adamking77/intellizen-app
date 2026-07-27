import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repositoryRoot = "/Users/adamking/projects/intellizen-app";
const claudeBinary = "/Users/adamking/.local/bin/claude";
const tauriManifest = `${repositoryRoot}/src-tauri/Cargo.toml`;
const nativeProbeBinary =
  `${repositoryRoot}/src-tauri/target/debug/examples/runtime_probe`;
const workerProfile =
  "/Users/adamking/Library/Application Support/IntelliZen/worker-profiles/claude-local-primary";
const workerMcpConfig = `${workerProfile}/mcp-worker.json`;
const expectedVersion = "2.1.220 (Claude Code)";
const workerTools = [
  "advance_workflow_step",
  "append_agent_work_note",
  "list_agent_projects",
  "list_agent_work",
  "list_databases",
  "list_role_assignments",
  "list_roles",
  "list_workflow_runs",
  "list_workflows",
  "query_records",
  "report_verification",
];
const providerTools = workerTools.map(
  (tool) => `mcp__intelizen-worker__${tool}`,
);

function runProgram(binary, args, { cwd, stdin, env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code, signal) =>
      resolve({ code, signal, stdout, stderr }),
    );
    child.stdin.end(stdin ?? "");
  });
}

function runClaude(args, options = {}) {
  return runProgram(claudeBinary, args, {
    ...options,
    env: {
      PATH: "/Users/adamking/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
      LANG: "C.UTF-8",
      CLAUDE_CONFIG_DIR: workerProfile,
      ...(options.env ?? {}),
    },
  });
}

function isSafeListRolesArguments(value) {
  if (value == null) return true;
  if (typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  if (keys.some((key) => !["include_retired", "limit"].includes(key))) {
    return false;
  }
  if (
    "include_retired" in value &&
    typeof value.include_retired !== "boolean"
  ) {
    return false;
  }
  return (
    !("limit" in value) ||
    (Number.isInteger(value.limit) && value.limit >= 1 && value.limit <= 100)
  );
}

async function startCapabilityBroker(token, proofNonce) {
  const calls = [];
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    if (
      request.method !== "POST" ||
      request.headers.authorization !== `Bearer ${token}`
    ) {
      response.writeHead(401).end();
      return;
    }
    let payload;
    try {
      payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      response.writeHead(400).end();
      return;
    }
    calls.push(payload);
    if (
      payload.tool !== "list_roles" ||
      !isSafeListRolesArguments(payload.arguments)
    ) {
      response.writeHead(403).end();
      return;
    }
    response
      .writeHead(200, { "content-type": "application/json" })
      .end(
        JSON.stringify([
          {
            id: "c1100000-0000-0000-0000-000000000002",
            role_key: "chief_engineer",
            role_name: "Chief Engineer",
            role_authority_ceiling: "local-write",
            proof_nonce: proofNonce,
          },
        ]),
      );
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Capability broker did not bind a loopback TCP port.");
  }
  return {
    calls,
    url: `http://127.0.0.1:${address.port}/capability`,
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

async function buildNativeProbe() {
  const build = await runProgram(
    "/Users/adamking/.cargo/bin/cargo",
    [
      "build",
      "--quiet",
      "--manifest-path",
      tauriManifest,
      "--example",
      "runtime_probe",
    ],
    { cwd: repositoryRoot, env: process.env },
  );
  if (build.code !== 0) {
    throw new Error(`Native probe build failed: ${build.stderr.trim()}`);
  }
}

function mcpServerNames(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry === "string") return [entry];
    return entry && typeof entry.name === "string" ? [entry.name] : [];
  });
}

const assignment = await mkdtemp(
  join(tmpdir(), "intellizen-gate6-claude-assignment."),
);
const capabilityToken = randomUUID();
const proofNonce = randomUUID().replaceAll("-", "");
const broker = await startCapabilityBroker(capabilityToken, proofNonce);
try {
  const gitInit = await runProgram("/usr/bin/git", ["init", "--quiet"], {
    cwd: assignment,
    env: {
      PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
      LANG: "C.UTF-8",
    },
  });
  if (gitInit.code !== 0) {
    throw new Error(
      `Probe repository initialization failed: ${gitInit.stderr.trim()}`,
    );
  }
  await writeFile(
    join(assignment, "README.md"),
    "# Gate 6 isolated Claude assignment\n\nNo application source or credentials are present.\n",
  );

  const version = await runClaude(["--version"], { cwd: assignment });
  if (version.code !== 0 || version.stdout.trim() !== expectedVersion) {
    throw new Error(
      `Claude version mismatch: ${version.stdout.trim() || version.stderr.trim()}`,
    );
  }
  const login = await runClaude(["auth", "status"], { cwd: assignment });
  if (login.code !== 0) {
    throw new Error("The isolated Claude worker profile requires provider login.");
  }

  const rawMcpConfig = JSON.parse(await readFile(workerMcpConfig, "utf8"));
  if (
    Object.keys(rawMcpConfig.mcpServers ?? {}).join(",") !==
      "intelizen-worker" ||
    JSON.stringify(rawMcpConfig).includes("SUPABASE_SERVICE_ROLE_KEY") ||
    JSON.stringify(rawMcpConfig).includes("SUPABASE_URL")
  ) {
    throw new Error("Claude worker MCP config does not match the isolated contract.");
  }

  await buildNativeProbe();
  const prompt = [
    "This is a bounded Gate 6 isolation probe.",
    "Call the intelizen-worker list_roles tool exactly once.",
    "Find chief_engineer and read its proof_nonce.",
    "Do not call another tool and do not modify files.",
    "Return exactly GATE6_OK:<proof_nonce>, replacing <proof_nonce> with the tool value.",
    "The nonce is absent from this prompt, so the tool call is required.",
  ].join("\n");
  const runtimeRunId = `gate6-claude-${randomUUID()}`;
  const tools = providerTools.join(",");
  const execution = await runProgram(nativeProbeBinary, [], {
    cwd: assignment,
    env: {
      PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
      LANG: "C.UTF-8",
    },
    stdin: JSON.stringify({
      runId: runtimeRunId,
      binary: claudeBinary,
      args: [
        "--safe-mode",
        "--mcp-config",
        workerMcpConfig,
        "--strict-mcp-config",
        "--tools",
        tools,
        "--allowedTools",
        tools,
        "--permission-mode",
        "dontAsk",
        "--no-session-persistence",
        "--verbose",
        "--include-partial-messages",
        "--output-format",
        "stream-json",
        "-p",
      ],
      workingDirectory: assignment,
      stdin: prompt,
      timeoutMs: 180_000,
      environment: {
        CLAUDE_CONFIG_DIR: workerProfile,
        INTELLIZEN_WORKER_CAPABILITY_URL: broker.url,
        INTELLIZEN_WORKER_CAPABILITY_TOKEN: capabilityToken,
      },
    }),
  });
  if (execution.code !== 0) {
    throw new Error(`Native Claude probe failed: ${execution.stderr.trim()}`);
  }
  const nativeEvents = execution.stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const nativeExit = nativeEvents.find((event) => event.kind === "native_exit");
  if (
    nativeExit?.reason !== "completed" ||
    nativeEvents.at(-2)?.kind !== "completed"
  ) {
    throw new Error(
      `Native runner terminal contract failed: ${JSON.stringify(
        nativeEvents.slice(-5),
      )}`,
    );
  }
  const providerEvents = nativeEvents
    .filter((event) => event.kind === "stdout" && typeof event.text === "string")
    .map((event) => JSON.parse(event.text));
  const init = providerEvents.find(
    (event) => event.type === "system" && event.subtype === "init",
  );
  const actualServers = mcpServerNames(init?.mcp_servers);
  const actualTools = [...(init?.tools ?? [])].sort();
  if (
    actualServers.length !== 1 ||
    actualServers[0] !== "intelizen-worker" ||
    JSON.stringify(actualTools) !== JSON.stringify([...providerTools].sort()) ||
    init?.permissionMode !== "dontAsk"
  ) {
    throw new Error(
      `Claude system/init isolation failed: ${JSON.stringify({
        mcp_servers: actualServers,
        tools: actualTools,
        permissionMode: init?.permissionMode,
      })}`,
    );
  }
  const result = providerEvents.find((event) => event.type === "result");
  if (
    result?.subtype !== "success" ||
    result?.is_error !== false ||
    result?.result !== `GATE6_OK:${proofNonce}`
  ) {
    throw new Error(
      `Claude terminal result failed: ${JSON.stringify(result ?? null)}`,
    );
  }
  if (
    broker.calls.length !== 1 ||
    broker.calls[0]?.tool !== "list_roles" ||
    !isSafeListRolesArguments(broker.calls[0]?.arguments)
  ) {
    throw new Error(
      `Claude capability use exceeded the probe: ${JSON.stringify(broker.calls)}`,
    );
  }
  const source = await readFile(join(assignment, "README.md"), "utf8");
  if (!source.includes("No application source or credentials are present.")) {
    throw new Error("Claude modified the isolated probe fixture.");
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        result: "passed",
        version: version.stdout.trim(),
        dispatch_boundary: "src-tauri/src/runtimes.rs",
        runtime_run_id: runtimeRunId,
        provider_session_id: init.session_id,
        worker_mcp_servers: actualServers,
        worker_tools: actualTools,
        admin_mcp_servers_visible: [],
        worker_capability_calls: broker.calls,
        assignment_modified: false,
        terminal_message: result.result,
        usage: result.usage ?? null,
        resume: false,
      },
      null,
      2,
    )}\n`,
  );
} finally {
  await broker.close();
  await rm(assignment, { recursive: true, force: true });
}
