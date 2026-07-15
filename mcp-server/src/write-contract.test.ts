import assert from "node:assert/strict";
import test from "node:test";

import { DRY_RUN_BANNER, dryRunPreview, resolveHomePinPlacement } from "./write-contract.js";

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
