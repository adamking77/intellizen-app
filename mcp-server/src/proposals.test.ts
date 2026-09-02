import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { proposeDocumentEdit, resolveDocPath } from "./proposals.js";

function setup() {
  const root = mkdtempSync(join(tmpdir(), "iz-proposals-"));
  writeFileSync(join(root, "Report.md"), "one\ntwo\n");
  return { vaultBase: root, dir: join(root, "proposals"), now: () => 7 };
}

test("a preview writes nothing", () => {
  const deps = setup();
  const out = proposeDocumentEdit({ doc_path: "Report.md", new_text: "one\nTWO\n", author: "Ada" }, deps);
  assert.equal(out.dry_run, true);
  assert.match(String((out as Record<string, unknown>).message), /DRY RUN — NOTHING WRITTEN/);
  assert.throws(() => readdirSync(deps.dir));
});

test("a confirmed write stages the file shape the Rust store reads", () => {
  const deps = setup();
  const out = proposeDocumentEdit(
    { doc_path: "Report.md", new_text: "one\nTWO\n", author: "Ada", note: " tighten ", confirm_write: true },
    deps,
  );
  assert.equal(out.write_performed, true);
  const files = readdirSync(deps.dir);
  assert.equal(files.length, 1);
  const staged = JSON.parse(readFileSync(join(deps.dir, files[0]), "utf-8"));
  assert.deepEqual(Object.keys(staged).sort(), ["at", "author", "docPath", "id", "newText", "note"]);
  assert.equal(staged.note, "tighten");
  assert.equal(readFileSync(join(deps.vaultBase, "Report.md"), "utf-8"), "one\ntwo\n", "the document is untouched");
});

test("a no-op, a missing file, and a path that walks out are refused", () => {
  const deps = setup();
  assert.throws(() => proposeDocumentEdit({ doc_path: "Report.md", new_text: "one\ntwo\n", author: "a" }, deps));
  assert.throws(() => proposeDocumentEdit({ doc_path: "Nope.md", new_text: "x", author: "a" }, deps));
  assert.throws(() => resolveDocPath("../etc/passwd", deps.vaultBase));
});
