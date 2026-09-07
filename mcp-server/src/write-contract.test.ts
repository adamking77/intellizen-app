import assert from "node:assert/strict";
import test from "node:test";

import { additiveDatabaseFields, databaseFieldsPreviewToken, DRY_RUN_BANNER, dryRunPreview, resolveHomePinPlacement } from "./write-contract.js";

test("additive metadata preserves existing definitions and supports exact repeated additions", () => {
  const original = [{ id: "relation", type: "relation", inverseFieldId: "linked", custom: { untouched: true } }];
  const fields = [{ id: "trigger", name: "Trigger", type: "text" }, { id: "kind", name: "Kind", type: "select", options: ["task", "keeping_out"] }];
  const next = additiveDatabaseFields(original, fields);
  assert.deepEqual(next.schema, [...original, ...fields]);
  assert.equal(next.schema[0], original[0]);
  assert.deepEqual(additiveDatabaseFields(next.schema, fields).added, []);
  assert.throws(() => additiveDatabaseFields(next.schema, [{ ...fields[0], name: "Changed" }]), /different definition/);
  assert.throws(() => additiveDatabaseFields(original, [fields[0], fields[0]]), /Duplicate/);
  for (const invalid of [[], [null], [{ id: "x", name: "X", type: "relation" }], [{ id: "x", name: "X", type: "select", options: ["a", "a"] }], [{ id: "x", name: "X", type: "text", options: [] }]]) {
    assert.throws(() => additiveDatabaseFields(original, invalid));
  }
});

test("schema preview token binds the database, revision and exact result", () => {
  const schema = [{ id: "trigger", name: "Trigger", type: "text" }];
  const token = databaseFieldsPreviewToken("tasks", "revision-1", schema);
  assert.equal(token, databaseFieldsPreviewToken("tasks", "revision-1", schema));
  assert.notEqual(token, databaseFieldsPreviewToken("other", "revision-1", schema));
  assert.notEqual(token, databaseFieldsPreviewToken("tasks", "revision-2", schema));
  assert.notEqual(token, databaseFieldsPreviewToken("tasks", "revision-1", []));
});

test("dry-run previews lead with an unmistakable no-write contract", () => {
  const preview = dryRunPreview("create_record", "create record", { record_name: "Example" });

  assert.equal(preview.banner, DRY_RUN_BANNER);
  assert.equal(preview.dry_run, true);
  assert.equal(preview.write_performed, false);
  assert.match(preview.message, /DRY RUN — NOTHING WRITTEN/);
  assert.equal((preview as Record<string, unknown>).record_name, "Example");
});

test("explicit bento coordinates are preserved", () => {
  const placement = resolveHomePinPlacement([], { x: 6, y: 8, w: 6, h: 8 });
  assert.deepEqual(placement, { x: 6, y: 8, w: 6, h: 8 });
});

test("automatic bento placement fills the first open horizontal slot", () => {
  const placement = resolveHomePinPlacement(
    [{ x: 0, y: 0, w: 6, h: 8 }],
    { w: 6, h: 8 },
  );
  assert.deepEqual(placement, { x: 6, y: 0, w: 6, h: 8 });
});

test("explicit coordinates must be paired integers within the grid", () => {
  assert.throws(
    () => resolveHomePinPlacement([], { x: 0, w: 6, h: 8 }),
    /x and y must be supplied together/,
  );
  assert.throws(
    () => resolveHomePinPlacement([], { x: 7, y: 0, w: 6, h: 8 }),
    /must fit within columns/,
  );
});
