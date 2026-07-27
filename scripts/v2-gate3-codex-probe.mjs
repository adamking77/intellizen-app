import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

const codexBinary = "/Users/adamking/.local/bin/codex";
const workerProfile =
  "/Users/adamking/Library/Application Support/IntelliZen/worker-profiles/codex-local-primary";
const expectedVersion = "codex-cli 0.145.0";

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
    "Do not call tools or modify files.",
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
        INTELLIZEN_WORKER_BROKER_URL: "http://127.0.0.1:9",
        INTELLIZEN_WORKER_BROKER_TOKEN: randomUUID(),
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
        assignment_modified: false,
        terminal_message: message,
        measured_usage: completion.usage ?? null,
      },
      null,
      2,
    ),
  );
} finally {
  await rm(assignment, { recursive: true, force: true });
}
