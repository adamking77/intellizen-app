import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

import { dryRunPreview } from "./write-contract.js";

/** The file the Rust store reads: `src-tauri/src/proposals.rs` ProposalFile.
 *  Hunks are never stored; the app diffs `newText` against the file on disk. */
export interface ProposalFile {
  id: string;
  /** Vault-relative (`~/vault/intelligence/<path>`) or absolute. */
  docPath: string;
  author: string;
  note: string;
  newText: string;
  at: number;
}

export const PROPOSALS_DIR = join(
  homedir(),
  "Library",
  "Application Support",
  "com.genzen.intellizen",
  "proposals",
);

export function resolveDocPath(docPath: string, vaultBase: string) {
  if (!docPath || docPath.split(/[\\/]/).includes("..")) {
    throw new Error(`Unusable document path: ${docPath}`);
  }
  return docPath.startsWith("/") ? docPath : join(vaultBase, docPath);
}

export function proposeDocumentEdit(
  input: { doc_path: string; new_text: string; author: string; note?: string; confirm_write?: boolean },
  deps: { vaultBase: string; dir?: string; now?: () => number },
) {
  const dir = deps.dir ?? PROPOSALS_DIR;
  const now = deps.now ?? Date.now;
  const full = resolveDocPath(input.doc_path, deps.vaultBase);
  if (!existsSync(full)) throw new Error(`Not found: ${full}`);
  if (readFileSync(full, "utf-8") === input.new_text) throw new Error("That proposal changes nothing.");

  const at = now();
  const file: ProposalFile = {
    id: `prop-${at.toString(16)}-${process.pid.toString(16)}`,
    docPath: input.doc_path,
    author: input.author,
    note: (input.note ?? "").trim(),
    newText: input.new_text,
    at,
  };
  const preview = {
    doc_path: input.doc_path,
    author: file.author,
    note: file.note,
    new_text_lines: input.new_text.split("\n").length,
    lands_as: "hunks Adam accepts or rejects in Docs; nothing is written to the document by this tool",
  };
  if (!input.confirm_write) return dryRunPreview("propose_document_edit", "stage the proposal", preview);

  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${file.id}.json`);
  writeFileSync(`${path}.tmp`, JSON.stringify(file, null, 2), "utf-8");
  renameSync(`${path}.tmp`, path);
  return { dry_run: false, write_performed: true, proposal_id: file.id, proposal_file: path, ...preview };
}

export const proposeDocumentEditTool = {
  name: "propose_document_edit",
  description:
    "Preview or stage an edit to a Docs markdown file as a proposal. new_text is the whole document as you would have it; Adam accepts or rejects it hunk by hunk in Docs. Nothing is written to the document by this tool.",
  inputSchema: {
    type: "object",
    properties: {
      doc_path: { type: "string", description: "The document's vault_path: relative to ~/vault/intelligence, or absolute." },
      new_text: { type: "string" },
      author: { type: "string" },
      note: { type: "string", description: "One line saying what this changes." },
      confirm_write: { type: "boolean", description: "Omit for a DRY RUN preview; true stages the proposal." },
    },
    required: ["doc_path", "new_text", "author"],
  },
};

export function proposeDocumentEditCall(args: unknown, vaultBase: string) {
  const out = proposeDocumentEdit(
    args as { doc_path: string; new_text: string; author: string; note?: string; confirm_write?: boolean },
    { vaultBase },
  );
  return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
}
