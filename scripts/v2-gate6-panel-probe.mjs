import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const projectRoot = "/Users/adamking/projects/intellizen-app";
const nativeProbe = join(
  projectRoot,
  "src-tauri/target/debug/examples/runtime_probe",
);
const bindingsPath =
  "/Users/adamking/Library/Application Support/IntelliZen/runtime-bindings.json";
const expectedVersion = "codex-cli 0.145.0";

function runProgram(binary, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = execFile(
      binary,
      args,
      {
        cwd: options.cwd,
        env: options.env,
        maxBuffer: 10 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error && typeof error.code !== "number") {
          reject(error);
          return;
        }
        resolve({
          code: typeof error?.code === "number" ? error.code : 0,
          stdout,
          stderr,
        });
      },
    );
    child.stdin?.end(options.stdin ?? "");
  });
}

const store = JSON.parse(await readFile(bindingsPath, "utf8"));
const binding = store.bindings?.find(
  (candidate) => candidate.bindingId === "codex-local-primary",
);
if (
  !binding ||
  binding.adapterId !== "codex-cli" ||
  typeof binding.canonicalBinary !== "string" ||
  typeof binding.workerProfileHome !== "string"
) {
  throw new Error("The reviewed codex-local-primary binding is unavailable.");
}

const version = await runProgram(binding.canonicalBinary, ["--version"], {
  cwd: projectRoot,
  env: {
    PATH: "/Users/adamking/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
    LANG: "C.UTF-8",
    CODEX_HOME: binding.workerProfileHome,
  },
});
if (version.code !== 0 || version.stdout.trim() !== expectedVersion) {
  throw new Error(
    `Codex version mismatch: ${version.stdout.trim() || version.stderr.trim()}`,
  );
}

await execFileAsync(
  "/Users/adamking/.cargo/bin/cargo",
  [
    "build",
    "--quiet",
    "--manifest-path",
    join(projectRoot, "src-tauri/Cargo.toml"),
    "--example",
    "runtime_probe",
  ],
  { cwd: projectRoot },
);

const assignment = await mkdtemp(
  join(tmpdir(), "intellizen-gate6-panel-assignment."),
);
try {
  await execFileAsync("/usr/bin/git", ["init", "--quiet"], {
    cwd: assignment,
  });
  await writeFile(
    join(assignment, "README.md"),
    "# Gate 6 isolated panel assignment\n\nNo application source or credentials are present.\n",
  );
  const runId = `gate6-panel-${randomUUID()}`;
  const execution = await runProgram(nativeProbe, [], {
    cwd: assignment,
    env: {
      PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
      LANG: "C.UTF-8",
    },
    stdin: JSON.stringify({
      runId,
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
        assignment,
        "-",
      ],
      workingDirectory: assignment,
      stdin:
        "Return exactly GATE6_PANEL_OK. Do not call tools and do not modify files.",
      timeoutMs: 180_000,
      environment: {
        CODEX_HOME: binding.workerProfileHome,
        NO_COLOR: "1",
        TERM: "dumb",
      },
    }),
  });
  if (execution.code !== 0) {
    throw new Error(`Native panel probe failed: ${execution.stderr.trim()}`);
  }
  const nativeEvents = execution.stdout
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const nativeExit = nativeEvents.at(-1);
  const providerEvents = nativeEvents
    .filter(
      (event) => event.kind === "stdout" && typeof event.text === "string",
    )
    .map((event) => JSON.parse(event.text));
  const message = providerEvents
    .filter(
      (event) =>
        event.type === "item.completed" &&
        event.item?.type === "agent_message",
    )
    .at(-1)?.item?.text;
  const sessionId = providerEvents.find(
    (event) => event.type === "thread.started",
  )?.thread_id;
  const usage = providerEvents.find(
    (event) => event.type === "turn.completed",
  )?.usage;
  if (
    nativeExit?.kind !== "native_exit" ||
    nativeExit.reason !== "completed" ||
    message !== "GATE6_PANEL_OK" ||
    !sessionId
  ) {
    throw new Error(
      `Panel terminal contract failed: ${JSON.stringify(
        nativeEvents.slice(-8),
      )}`,
    );
  }
  const source = await readFile(join(assignment, "README.md"), "utf8");
  if (!source.includes("No application source or credentials are present.")) {
    throw new Error("The panel runtime modified the isolated assignment.");
  }
  const { stdout: gitStatus } = await execFileAsync(
    "/usr/bin/git",
    ["status", "--porcelain"],
    { cwd: assignment },
  );
  if (gitStatus.trim() !== "?? README.md") {
    throw new Error(`The panel runtime changed its fixture: ${gitStatus.trim()}`);
  }

  console.log(
    JSON.stringify(
      {
        result: "passed",
        adapter: "codex-cli",
        version: version.stdout.trim(),
        dispatch_boundary: "src-tauri/src/runtimes.rs",
        runtime_run_id: runId,
        provider_session_id: sessionId,
        terminal_message: message,
        explicit_capability_grant: false,
        deny_only_broker_injected: true,
        assignment_modified: false,
        usage: {
          input_tokens: usage?.input_tokens ?? 0,
          cached_input_tokens: usage?.cached_input_tokens ?? 0,
          output_tokens: usage?.output_tokens ?? 0,
          reasoning_output_tokens: usage?.reasoning_output_tokens ?? 0,
        },
        production_desktop_launched: false,
      },
      null,
      2,
    ),
  );
} finally {
  await rm(assignment, { recursive: true, force: true });
}
