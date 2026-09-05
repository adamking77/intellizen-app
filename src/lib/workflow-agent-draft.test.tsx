// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { workflowDefinitionHash } from "./workflow-schema";
import { createWorkflowDesignerDraft } from "./workflow-designer";
import { parseWorkflowAgentProposal, useWorkflowAgentDraft, workflowAgentDraftContext } from "./workflow-agent-draft";
import { parseConversationContext, promptWithConversationContext, readConversationContext } from "./conversation-context";

const vault = vi.hoisted(() => ({ exists: vi.fn(), read: vi.fn() }));
vi.mock("./vault", () => ({ vaultPathExists: vault.exists, readVaultFile: vault.read }));
const definition = createWorkflowDesignerDraft({ id: "unsaved-draft", name: "Unsaved proposal example" });
const baseRevision = await workflowDefinitionHash(definition);
const file = { id: "proposal-1", draftKey: "unsaved-draft", baseRevision, summary: "Clarify the work", definition };
let close: (() => Promise<void>) | null = null;
beforeEach(() => { window.localStorage.clear(); vault.exists.mockReset().mockResolvedValue(false); vault.read.mockReset(); });
afterEach(async () => { await close?.(); close = null; vi.restoreAllMocks(); });

describe("workflow agent draft handoff", () => {
  it("shares the complete unsaved definition, revision and selected node on the actual route", async () => {
    const context = await workflowAgentDraftContext({ draftKey: "unsaved-draft", currentDefinition: definition, selectedStepId: "step_1" }, { pathname: "/workflows", search: "?draft=unsaved-draft" });
    expect(context.workflowDraft).toMatchObject({ definition, draftKey: "unsaved-draft", baseRevision, selectedStepId: "step_1" });
    expect(context.route.search).toBe("?draft=unsaved-draft");
    expect(parseConversationContext(context)).toEqual(context);
    const prompt = promptWithConversationContext("Help refine this", context);
    expect(prompt).toContain(JSON.stringify(context));
    expect(prompt).toContain("grants no permission");
    expect(prompt).toContain("propose_workflow_draft");
  });

  it("refuses malformed, wrong-target, invalid-schema and oversized proposals", () => {
    expect(() => parseWorkflowAgentProposal("{", "unsaved-draft")).toThrow();
    expect(() => parseWorkflowAgentProposal(JSON.stringify(file), "another-draft")).toThrow(/another workflow/);
    expect(() => parseWorkflowAgentProposal(JSON.stringify({ ...file, definition: {} }), "unsaved-draft")).toThrow(/Invalid workflow/);
    expect(() => parseWorkflowAgentProposal("x".repeat(600_000), "unsaved-draft")).toThrow(/512 KiB/);
  });

  it("blocks secret-shaped draft content before it reaches shared context", async () => {
    await expect(workflowAgentDraftContext({ draftKey: "unsaved-draft", currentDefinition: { ...definition, name: "authorization: Bearer abcdefghijklmnopqrstuvwxyz123456" } }, { pathname: "/workflows", search: "" })).rejects.toThrow(/Persistence rejected/);
  });

  it("polls only this proposal file, preserves stale proposals visibly, and remembers dismissal", async () => {
    vault.exists.mockResolvedValue(true);
    vault.read.mockResolvedValue(JSON.stringify(file));
    const element = document.createElement("div");
    const root = createRoot(element);
    close = async () => { await act(async () => root.unmount()); };
    let bridge!: ReturnType<typeof useWorkflowAgentDraft>;
    function Harness({ name }: { name: string }) { bridge = useWorkflowAgentDraft({ draftKey: "unsaved-draft", currentDefinition: { ...definition, name }, selectedStepId: "step_1" }); return null; }
    await act(async () => root.render(<Harness name="Changed while agent worked" />));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    expect(vault.read).toHaveBeenCalledWith("session/intellizen-workflow-drafts/unsaved-draft.json", "vault");
    expect(bridge.proposal?.id).toBe("proposal-1");
    expect(bridge.error).toContain("older draft");
    expect(bridge.proposal?.definition.name).toBe(definition.name);
    await act(async () => bridge.requestWithAgent());
    expect(readConversationContext()?.workflowDraft?.definition.name).toBe("Changed while agent worked");
    await act(async () => bridge.dismiss());
    expect(bridge.proposal).toBeNull();
    expect(window.localStorage.getItem("intelizen:workflow-proposal-reviewed:unsaved-draft")).toBe("proposal-1");
  });
});
