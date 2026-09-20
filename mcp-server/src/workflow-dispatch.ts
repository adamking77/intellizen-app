import { createConnection } from "node:net";
import { readFile, lstat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, relative, sep } from "node:path";
import { randomUUID } from "node:crypto";

const MAX_LINE = 4096;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type WorkflowDispatchResult = {
  status: "accepted" | "rejected" | "unavailable";
  error?: string;
};

type Discovery = { socketPath?: unknown; pid?: unknown; launchId?: unknown };

function appDataCandidates() {
  const base = join(homedir(), "Library", "Application Support");
  return [join(base, "com.genzen.intellizen"), join(base, "com.genzen.intellizen.v3dev")];
}

function validSocketPath(value: unknown, appData: string): value is string {
  if (typeof value !== "string" || !value || value.length > 512) return false;
  const dir = join(appData, "wd");
  const rel = relative(dir, value);
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !rel.includes(sep + ".");
}

async function liveDiscovery(appDataRoots = appDataCandidates()) {
  const found: Array<{ appData: string; discovery: Discovery }> = [];
  for (const appData of appDataRoots) {
    try {
      const path = join(appData, "workflow-dispatch.json");
      const info = await lstat(path);
      if (!info.isFile() || info.uid !== process.getuid?.() || (info.mode & 0o777) !== 0o600) continue;
      const discovery = JSON.parse(await readFile(path, "utf8")) as Discovery;
      if (!validSocketPath(discovery.socketPath, appData)
        || !Number.isSafeInteger(discovery.pid) || (discovery.pid as number) <= 0
        || typeof discovery.launchId !== "string" || !discovery.launchId) continue;
      const socket = await lstat(discovery.socketPath);
      if (!socket.isSocket() || socket.uid !== process.getuid?.() || (socket.mode & 0o777) !== 0o600) continue;
      try { process.kill(discovery.pid as number, 0); } catch { continue; }
      found.push({ appData, discovery });
    } catch { /* absent, stale, or malformed discovery is unavailable */ }
  }
  return found.length === 1 ? found[0] : null;
}

export async function dispatchWorkflowStart(input: {
  runId: string;
  startAttempt: { idempotencyKey: string; requestHash: string };
}, appDataRoots = appDataCandidates()): Promise<WorkflowDispatchResult> {
  if (!UUID.test(input.runId) || input.startAttempt.idempotencyKey.length < 1
    || input.startAttempt.idempotencyKey.length > 255
    || ![...input.startAttempt.idempotencyKey].every((char) => char.charCodeAt(0) >= 0x21 && char.charCodeAt(0) <= 0x7e)
    || !/^[0-9a-f]{64}$/i.test(input.startAttempt.requestHash)) {
    return { status: "rejected", error: "Invalid persisted workflow dispatch identity." };
  }
  const live = await liveDiscovery(appDataRoots);
  if (!live) return { status: "unavailable", error: "IntelliZen is not running or its workflow dispatch listener is unavailable." };
  const requestId = randomUUID();
  const payload = JSON.stringify({ requestId, runId: input.runId, startAttempt: input.startAttempt }) + "\n";
  if (Buffer.byteLength(payload) > MAX_LINE) return { status: "rejected", error: "Workflow dispatch request exceeds the bounded size." };
  return await new Promise((resolve) => {
    const socket = createConnection(live.discovery.socketPath as string);
    let data = "";
    let settled = false;
    const finish = (result: WorkflowDispatchResult) => { if (!settled) { settled = true; socket.destroy(); resolve(result); } };
    socket.setTimeout(6000, () => finish({ status: "unavailable", error: "IntelliZen did not acknowledge workflow dispatch." }));
    socket.once("error", () => finish({ status: "unavailable", error: "IntelliZen workflow dispatch is unavailable." }));
    socket.once("end", () => finish({ status: "unavailable", error: "IntelliZen closed workflow dispatch without an acknowledgement." }));
    socket.once("close", () => finish({ status: "unavailable", error: "IntelliZen closed workflow dispatch without an acknowledgement." }));
    socket.on("data", (chunk) => {
      data += chunk.toString("utf8");
      if (Buffer.byteLength(data) > MAX_LINE) return finish({ status: "rejected", error: "Invalid bounded workflow dispatch response." });
      const newline = data.indexOf("\n");
      if (newline < 0) return;
      try {
        const response = JSON.parse(data.slice(0, newline)) as { requestId?: unknown; status?: unknown; error?: unknown };
        if (response.requestId !== requestId || !["accepted", "rejected", "unavailable"].includes(String(response.status))) {
          return finish({ status: "rejected", error: "Invalid workflow dispatch response." });
        }
        finish({ status: response.status as WorkflowDispatchResult["status"], ...(typeof response.error === "string" ? { error: response.error } : {}) });
      } catch { finish({ status: "rejected", error: "Invalid workflow dispatch response." }); }
    });
    socket.once("connect", () => socket.write(payload));
  });
}
