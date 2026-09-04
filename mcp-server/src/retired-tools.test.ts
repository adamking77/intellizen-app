import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const retired = [
  "list_monitors",
  "create_monitor",
  "update_monitor",
  "delete_monitor",
  "run_monitor",
  "refresh_inbox",
  "list_investigations",
  "get_investigation",
  "create_investigation",
  "update_investigation",
  "add_signal_to_investigation",
  "import_project_signals_to_investigation",
];

test("the twelve tree-replaced tools stay out of the MCP registry and dispatcher", () => {
  const source = readFileSync(fileURLToPath(new URL("index.ts", import.meta.url)), "utf8");
  assert.equal(retired.length, 12);
  for (const name of retired) assert.equal(source.includes(`\"${name}\"`), false, name);
});
