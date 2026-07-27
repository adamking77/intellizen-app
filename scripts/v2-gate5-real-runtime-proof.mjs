import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const projectRoot = "/Users/adamking/projects/intellizen-app";
const tauriManifest = join(projectRoot, "src-tauri/Cargo.toml");
const nativeProbe = join(
  projectRoot,
  "src-tauri/target/debug/examples/runtime_probe",
);
const bindingsPath =
  "/Users/adamking/Library/Application Support/IntelliZen/runtime-bindings.json";
const expectedVersion = "codex-cli 0.145.0";

function runProgram(binary, args, options = {}) {
  return new Promise((resolve, reject) => {
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
    child.once("error", reject);
    child.once("close", (code, signal) =>
      resolve({ code: code ?? -1, signal, stdout, stderr }),
    );
    child.stdin.end(options.stdin ?? "");
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

const sanitizedEnvironment = {
  PATH: "/Users/adamking/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
  LANG: "C.UTF-8",
  LC_ALL: "C.UTF-8",
  CODEX_HOME: binding.workerProfileHome,
};
const version = await runProgram(binding.canonicalBinary, ["--version"], {
  cwd: projectRoot,
  env: sanitizedEnvironment,
});
if (version.code !== 0 || version.stdout.trim() !== expectedVersion) {
  throw new Error(
    `Codex version mismatch: ${version.stdout.trim() || version.stderr.trim()}`,
  );
}

const build = await runProgram(
  "/Users/adamking/.cargo/bin/cargo",
  ["build", "--quiet", "--manifest-path", tauriManifest, "--example", "runtime_probe"],
  { cwd: projectRoot, env: process.env },
);
if (build.code !== 0) {
  throw new Error(`Native runtime probe build failed: ${build.stderr.trim()}`);
}

const assignment = await mkdtemp(join(tmpdir(), "intellizen-gate5-timeout."));
try {
  const init = await runProgram("/usr/bin/git", ["init", "--quiet"], {
    cwd: assignment,
    env: {
      PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
      LANG: "C.UTF-8",
    },
  });
  if (init.code !== 0) throw new Error("Could not initialize the timeout fixture.");
  await writeFile(
    join(assignment, "README.md"),
    "# Gate 5 real-runtime timeout fixture\n\nNo application source or credentials are present.\n",
  );

  const runtimeRunId = `gate5-${randomUUID()}`;
  const execution = await runProgram(nativeProbe, [], {
    cwd: assignment,
    env: {
      PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
      LANG: "C.UTF-8",
      LC_ALL: "C.UTF-8",
    },
    stdin: JSON.stringify({
      runId: runtimeRunId,
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
        "This is a bounded timeout probe. Do not call tools or modify files. Return exactly GATE5_TIMEOUT_SHOULD_NOT_PERSIST.",
      timeoutMs: 100,
      environment: {
        CODEX_HOME: binding.workerProfileHome,
        NO_COLOR: "1",
        TERM: "dumb",
      },
    }),
  });
  if (execution.code !== 0) {
    throw new Error(`Native timeout probe failed: ${execution.stderr.trim()}`);
  }
  const events = execution.stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const nativeExit = events.find((event) => event.kind === "native_exit");
  const terminal = events.find((event) => event.kind === "timed_out");
  const persistedResult = events.some(
    (event) =>
      typeof event.text === "string" &&
      event.text.includes("GATE5_TIMEOUT_SHOULD_NOT_PERSIST"),
  );
  if (
    nativeExit?.reason !== "timed_out" ||
    !terminal ||
    persistedResult ||
    events.at(-1)?.kind !== "native_exit"
  ) {
    throw new Error(
      `Real runtime timeout was not truthful: ${JSON.stringify(events.slice(-8))}`,
    );
  }

  await new Promise((resolve) => setTimeout(resolve, 250));
  const orphanCheck = await runProgram("/usr/bin/pgrep", ["-f", assignment], {
    cwd: assignment,
    env: {
      PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
      LANG: "C.UTF-8",
    },
  });
  if (orphanCheck.code === 0 && orphanCheck.stdout.trim()) {
    throw new Error("A real Codex timeout left an assignment process running.");
  }

  const source = await readFile(join(assignment, "README.md"), "utf8");
  if (!source.includes("No application source or credentials are present.")) {
    throw new Error("The timed-out runtime modified its fixture.");
  }

  console.log(
    JSON.stringify(
      {
        result: "passed",
        adapter: "codex-cli",
        version: version.stdout.trim(),
        dispatch_boundary: "src-tauri/src/runtimes.rs",
        runtime_run_id: runtimeRunId,
        terminal_reason: nativeExit.reason,
        terminal_event_observed: true,
        result_persisted: persistedResult,
        orphan_processes: 0,
        assignment_modified: false,
        production_desktop_launched: false,
      },
      null,
      2,
    ),
  );
} finally {
  await rm(assignment, { recursive: true, force: true });
}
