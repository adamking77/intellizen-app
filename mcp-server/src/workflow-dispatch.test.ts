import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import test from "node:test";
import { dispatchWorkflowStart } from "./workflow-dispatch.js";

const runId = "00000000-0000-4000-8000-000000000001";
const requestHash = "a".repeat(64);
const attempt = { idempotencyKey: "attempt-1", requestHash };

async function fixture(response: (request: Record<string, unknown>) => string | null) {
  const appData = await mkdtemp(join(tmpdir(), "intellizen-dispatch-"));
  const wd = join(appData, "wd");
  await mkdir(wd, { mode: 0o700 });
  const socketPath = join(wd, "listener.sock");
  const server = createServer((socket) => {
    let text = "";
    socket.on("data", (chunk) => {
      text += chunk.toString();
      const newline = text.indexOf("\n");
      if (newline < 0) return;
      const reply = response(JSON.parse(text.slice(0, newline)));
      if (reply == null) socket.end();
      else socket.end(`${reply}\n`);
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, resolve);
  });
  await chmod(socketPath, 0o600);
  await writeFile(join(appData, "workflow-dispatch.json"), JSON.stringify({ socketPath, pid: process.pid, launchId: "fixture" }) + "\n", { mode: 0o600 });
  return { appData, server };
}

test("dispatch accepts a correlated native acknowledgement", async () => {
  const fixtureState = await fixture((request) => JSON.stringify({ requestId: request.requestId, status: "accepted" }));
  try {
    const result = await dispatchWorkflowStart({ runId, startAttempt: attempt }, [fixtureState.appData]);
    assert.deepEqual(result, { status: "accepted" });
  } finally { await new Promise<void>((resolve) => fixtureState.server.close(() => resolve())); }
});

test("dispatch refuses an early closed socket", async () => {
  const fixtureState = await fixture(() => null);
  try {
    const result = await dispatchWorkflowStart({ runId, startAttempt: attempt }, [fixtureState.appData]);
    assert.equal(result.status, "unavailable");
  } finally { await new Promise<void>((resolve) => fixtureState.server.close(() => resolve())); }
});

test("dispatch reports unavailable when no native discovery exists", async () => {
  const result = await dispatchWorkflowStart({ runId, startAttempt: attempt }, [join(tmpdir(), "missing-intellizen-dispatch")]);
  assert.equal(result.status, "unavailable");
});
