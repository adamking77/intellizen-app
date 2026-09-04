import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WorkflowTable } from "./workflow-table";
import type { WorkflowCatalogItem } from "@/lib/workflow-catalog";

const item = (state: WorkflowCatalogItem["state"], name: string): WorkflowCatalogItem => ({
  state,
  executable: state !== "sop-only",
  runnable: state === "runnable",
  definition: null,
  blockers: [],
  workflow: {
    id: name,
    workflow_id: name.toLowerCase().replaceAll(" ", "-"),
    name,
    status: null,
    entity: null,
    owner_role: "operator",
    default_actor: "Fiona",
    source_document_id: null,
    source_path: null,
    trigger: null,
    required_inputs: null,
    default_routing: null,
    approval_gates: null,
    expected_output: null,
    related_databases: [],
    receipt_template: null,
    success_criteria: null,
    failure_behavior: null,
    definition: null,
    definition_version: null,
    run_ids: [],
    body_preview: "",
    updated_at: "2026-09-04T00:00:00Z",
  },
});

describe("WorkflowTable", () => {
  it("uses Run, Finish, and Make runnable for the three row states", () => {
    const html = renderToStaticMarkup(<WorkflowTable items={[item("runnable", "Ready"), item("draft", "Draft"), item("sop-only", "SOP")]} runs={[]} selectedId="Ready" search="" running={false} onSearch={() => {}} onSelect={() => {}} onRun={() => {}} onFinish={() => {}} onMakeRunnable={() => {}} />);
    expect(html).toContain(">Run<");
    expect(html).toContain(">Finish<");
    expect(html).toContain(">Make runnable<");
    expect(html).toContain("aria-selected=\"true\"");
  });
});
