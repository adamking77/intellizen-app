import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const codexBinary = "/Users/adamking/.local/bin/codex";
const workerProfile =
  "/Users/adamking/Library/Application Support/IntelliZen/worker-profiles/codex-local-primary";
const expectedVersion = "codex-cli 0.145.0";

async function startCapabilityBroker(token) {
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

    if (payload.tool !== "list_roles") {
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

const assignment = await mkdtemp(join(tmpdir(), "intellizen-gate3-assignment."));
const capabilityToken = randomUUID();
const broker = await startCapabilityBroker(capabilityToken);
try {
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
    "Confirm its result contains the chief_engineer role.",
    "Do not call any other tool and do not modify files.",
    "Return exactly GATE3_OK.",
  ].join("\n");
  const execution = await run(
    [
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
    {
      cwd: assignment,
      stdin: prompt,
      env: {
        INTELLIZEN_WORKER_CAPABILITY_URL: broker.url,
        INTELLIZEN_WORKER_CAPABILITY_TOKEN: capabilityToken,
      },
    },
  );
  if (execution.code !== 0) {
    throw new Error(`Codex probe failed: ${execution.stderr.trim()}`);
  }
  const events = execution.stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const message = events.find(
    (event) =>
      event.type === "item.completed" && event.item?.type === "agent_message",
  )?.item?.text;
  const completion = events.find((event) => event.type === "turn.completed");
  if (message !== "GATE3_OK" || !completion) {
    throw new Error("Codex probe did not produce the pinned terminal contract.");
  }
  if (
    broker.calls.length !== 1 ||
    broker.calls[0]?.tool !== "list_roles" ||
    JSON.stringify(broker.calls[0]?.arguments ?? {}) !== "{}"
  ) {
    throw new Error("Codex did not use exactly the bounded worker capability.");
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
