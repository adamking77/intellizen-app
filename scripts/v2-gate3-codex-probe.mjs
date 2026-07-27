import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const codexBinary = "/Users/adamking/.local/bin/codex";
const repositoryRoot = "/Users/adamking/projects/intellizen-app";
const tauriManifest = `${repositoryRoot}/src-tauri/Cargo.toml`;
const nativeProbeBinary =
  `${repositoryRoot}/src-tauri/target/debug/examples/runtime_probe`;
const workerProfile =
  "/Users/adamking/Library/Application Support/IntelliZen/worker-profiles/codex-local-primary";
const expectedVersion = "codex-cli 0.145.0";

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

function run(args, { cwd, stdin, env = {} } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(codexBinary, args, {
      cwd,
      env: {
        PATH: "/Users/adamking/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
        LANG: "C.UTF-8",
        CODEX_HOME: workerProfile,
        ...env,
      },
      stdio: ["pipe", "pipe", "pipe"],
      detached: true,
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
    child.on("close", (code, signal) => resolve({ code, signal, stdout, stderr }));
    if (stdin) child.stdin.end(stdin);
    else child.stdin.end();
  });
}

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
    child.on("close", (code, signal) => resolve({ code, signal, stdout, stderr }));
    child.stdin.end(stdin ?? "");
  });
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
    {
      cwd: repositoryRoot,
      env: process.env,
    },
  );
  if (build.code !== 0) {
    throw new Error(`Native probe build failed: ${build.stderr.trim()}`);
  }
}

const assignment = await mkdtemp(join(tmpdir(), "intellizen-gate3-assignment."));
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
    throw new Error(`Probe repository initialization failed: ${gitInit.stderr.trim()}`);
  }
  await writeFile(
    join(assignment, "README.md"),
    "# Gate 3 isolated assignment\n\nNo application source or credentials are present.\n",
  );

  const version = await run(["--version"]);
  if (version.code !== 0 || version.stdout.trim() !== expectedVersion) {
    throw new Error(
      `Codex version mismatch: ${version.stdout.trim() || version.stderr.trim()}`,
    );
  }

  const login = await run(["login", "status"]);
  if (login.code !== 0) {
    throw new Error("The isolated Codex worker profile requires provider login.");
  }

  const inventory = await run(["mcp", "list"]);
  if (
    inventory.code !== 0 ||
    !inventory.stdout.includes("intelizen-worker") ||
    inventory.stdout.includes("supabase-genzen") ||
    inventory.stdout.includes("node_repl") ||
    inventory.stdout.includes("computer-use")
  ) {
    throw new Error("The isolated MCP inventory does not match the worker-only contract.");
  }

  const prompt = [
    "This is a bounded Gate 3 isolation probe.",
    "Call the intelizen-worker list_roles tool exactly once.",
    "Find the chief_engineer role and read its proof_nonce value.",
    "Do not call any other tool and do not modify files.",
    "Return exactly GATE3_OK:<proof_nonce>, replacing <proof_nonce> with that value.",
    "The proof_nonce is not present in this prompt, so you must use the tool.",
  ].join("\n");
  await buildNativeProbe();
  const runtimeRunId = `gate3-${randomUUID()}`;
  const execution = await runProgram(nativeProbeBinary, [], {
    cwd: assignment,
    env: {
      PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
      LANG: "C.UTF-8",
    },
    stdin: JSON.stringify({
      runId: runtimeRunId,
      binary: codexBinary,
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
        assignment,
        "-",
      ],
      workingDirectory: assignment,
      stdin: prompt,
      timeoutMs: 180_000,
      environment: {
        CODEX_HOME: workerProfile,
        INTELLIZEN_WORKER_CAPABILITY_URL: broker.url,
        INTELLIZEN_WORKER_CAPABILITY_TOKEN: capabilityToken,
      },
    }),
  });
  if (execution.code !== 0) {
    throw new Error(`Native Codex probe failed: ${execution.stderr.trim()}`);
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
      `The native runner did not report a truthful completed exit: ${JSON.stringify(
        nativeEvents.slice(-5),
      )}`,
    );
  }
  const events = nativeEvents
    .filter((event) => event.kind === "stdout" && typeof event.text === "string")
    .map((event) => JSON.parse(event.text));
  const message = events
    .filter(
      (event) =>
        event.type === "item.completed" &&
        event.item?.type === "agent_message" &&
        event.item.text,
    )
    .at(-1)?.item?.text;
  const completion = events.find((event) => event.type === "turn.completed");
  const providerSessionId = events.find(
    (event) => event.type === "thread.started",
  )?.thread_id;
  if (message !== `GATE3_OK:${proofNonce}` || !completion) {
    throw new Error(
      `Codex probe did not produce the pinned terminal contract: ${JSON.stringify({
        message,
        completion,
        events,
      })}`,
    );
  }
  if (
    broker.calls.length !== 1 ||
    broker.calls[0]?.tool !== "list_roles" ||
    !isSafeListRolesArguments(broker.calls[0]?.arguments)
  ) {
    throw new Error(
      `Codex did not use exactly the bounded worker capability: ${JSON.stringify(
        {
          calls: broker.calls,
          nativeEvents,
        },
      )}`,
    );
  }
  const source = await readFile(join(assignment, "README.md"), "utf8");
  if (!source.includes("No application source or credentials are present.")) {
    throw new Error("Codex modified the read-only probe fixture.");
  }
  console.log(
    JSON.stringify(
      {
        result: "passed",
        version: version.stdout.trim(),
        dispatch_boundary: "src-tauri/src/runtimes.rs",
        runtime_run_id: runtimeRunId,
        provider_session_id: providerSessionId,
        worker_mcp_servers: ["intelizen-worker"],
        admin_mcp_servers_visible: [],
        worker_capability_calls: broker.calls,
        assignment_modified: false,
        terminal_message: message,
        measured_usage: completion.usage ?? null,
      },
      null,
      2,
    ),
  );
} finally {
  await broker.close();
  await rm(assignment, { recursive: true, force: true });
}
