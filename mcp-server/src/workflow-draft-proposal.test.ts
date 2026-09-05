import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { proposeWorkflowDraft } from "./workflow-draft-proposal.js";
import { WORKER_TOOL_NAMES } from "./control-plane.js";

const definition = {
  schema: "intellizen.workflow/1", id: "draft-example", name: "Example", version: 1,
  trigger: { kind: "manual" }, inputs: [],
  steps: [{ id: "step_1", kind: "role-assign", title: "Review", role: "operations_director", resolution: "primary-active-occupant", instructions: "Review the material.", contextRefs: [], execution: "durable", verification: { required: false, method: null }, timeoutMinutes: 30, next: null }],
};
const input = { draft_key: "draft-example", base_revision: "a".repeat(64), definition, summary: "Clarify the review step." };

test("preview is read-only and confirmed proposals use the exact bounded file", () => {
  const vault = mkdtempSync(join(tmpdir(), "iz-workflow-draft-"));
  try {
    const preview = proposeWorkflowDraft(input, vault);
    assert.equal(preview.dry_run, true);
    assert.deepEqual(readdirSync(vault), []);
    const staged = proposeWorkflowDraft({ ...input, confirm_write: true }, vault);
    assert.equal(staged.write_performed, true);
    const dir = join(vault, "session/intellizen-workflow-drafts");
    assert.deepEqual(readdirSync(dir), ["draft-example.json"]);
    const proposal = JSON.parse(readFileSync(join(dir, "draft-example.json"), "utf8"));
    assert.equal(proposal.baseRevision, input.base_revision);
    assert.deepEqual(proposal.definition, definition);
    assert.equal(proposal.draftKey, input.draft_key);
    assert.equal(WORKER_TOOL_NAMES.has("propose_workflow_draft"), false);
  } finally { rmSync(vault, { recursive: true, force: true }); }
});

test("invalid target, revision, schema, oversized data and secrets never write", () => {
  const vault = mkdtempSync(join(tmpdir(), "iz-workflow-draft-"));
  try {
    for (const patch of [
      { draft_key: "../escape" }, { draft_key: "/tmp/escape" }, { base_revision: "stale-looking-not-a-hash" },
      { definition: { ...definition, steps: [] } }, { summary: "x".repeat(2001) },
      { definition: { ...definition, name: "x".repeat(600_000) } },
      { summary: "authorization: Bearer abcdefghijklmnopqrstuvwxyz123456" },
    ]) assert.throws(() => proposeWorkflowDraft({ ...input, ...patch, confirm_write: true }, vault));
    assert.deepEqual(readdirSync(vault), []);
  } finally { rmSync(vault, { recursive: true, force: true }); }
});

test("a symlinked proposal directory cannot redirect a confirmed write", () => {
  const vault = mkdtempSync(join(tmpdir(), "iz-workflow-draft-"));
  const outside = mkdtempSync(join(tmpdir(), "iz-workflow-outside-"));
  try {
    symlinkSync(outside, join(vault, "session"));
    assert.throws(() => proposeWorkflowDraft({ ...input, confirm_write: true }, vault), /symlink/);
    assert.equal(existsSync(join(outside, "intellizen-workflow-drafts")), false);
  } finally { rmSync(vault, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); }
});
