import assert from "node:assert/strict";
import test from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { callHierarchyWriteTool, descendants, hierarchyWriteTools, validateParent } from "./hierarchy-writes.js";
import type { HierarchyNode } from "./hierarchy.js";
import { DRY_RUN_BANNER } from "./write-contract.js";

const row = (id: string, kind: HierarchyNode["kind"], parent_id: string | null): HierarchyNode => ({
  id, kind, parent_id, name: id, folders: [], position: 0,
});

test("tree parent rules and descendant walks match the database contract", () => {
  const department = row("department", "department", null);
  const workspace = row("workspace", "workspace", department.id);
  const project = row("project", "project", workspace.id);
  const child = row("child", "project", project.id);

  validateParent("workspace", department);
  validateParent("project", workspace);
  validateParent("project", project);
  assert.throws(() => validateParent("workspace", project), /department parent/);
  assert.deepEqual(descendants([department, workspace, project, child], workspace.id).map((item) => item.id), ["project", "child"]);
});

test("every hierarchy mutation requires the write confirmation field", () => {
  assert.equal(hierarchyWriteTools.length, 4);
  for (const tool of hierarchyWriteTools) {
    assert.ok("confirm_write" in tool.inputSchema.properties, tool.name);
  }
});

test("create defaults to an unmistakable no-write preview", async () => {
  const query = { order: () => query, then: (resolve: (value: unknown) => void) => resolve({ data: [], error: null }) };
  const fake = {
    schema: () => ({ from: () => ({ select: () => query }) }),
  } as unknown as SupabaseClient;
  const result = await callHierarchyWriteTool(fake, "create_hierarchy_node", {
    kind: "department",
    name: "Example",
    actor: "test",
  }, async () => undefined) as Record<string, unknown>;

  assert.equal(result.banner, DRY_RUN_BANNER);
  assert.equal(result.write_performed, false);
});
