// @vitest-environment happy-dom
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { useSessionStore } from "./session-store";
import { setGatewayClient } from "./gateway";
import type { JsonRpcGatewayClient } from "./json-rpc-gateway";
import { FakeGatewayClient } from "./test-support";
import { createRouteConversationContext, publishConversationContext } from "@/lib/conversation-context";
import { workflowAgentDraftContext } from "@/lib/workflow-agent-draft";
import { createWorkflowDesignerDraft } from "@/lib/workflow-designer";

const acp = vi.hoisted(() => ({ submit: vi.fn(async (_session: string, _prompt: string) => undefined) }));
vi.mock("./acp-session", () => ({
  createAcpSession: vi.fn(async () => "acp-session"),
  onAcpEvent: () => () => {},
  submitAcpPrompt: acp.submit,
  interruptAcpSession: vi.fn(), respondAcpApproval: vi.fn(),
}));

describe("selected material at the shared send boundary", () => {
  let client: FakeGatewayClient;
  beforeEach(() => {
    window.localStorage.clear();
    useSessionStore.setState({ threads: {} });
    client = new FakeGatewayClient();
    setGatewayClient(client as unknown as JsonRpcGatewayClient);
    acp.submit.mockClear();
  });
  afterEach(() => setGatewayClient(null));

  it("sends exact document references to Hermes while retaining the user's visible text", async () => {
    const context = createRouteConversationContext({ pathname: "/docs", search: "?record=document-b&project=project-a" });
    context.selections = [{ kind: "document", documentId: "document-b", label: "Brief" }];
    publishConversationContext(context);
    await useSessionStore.getState().send("engineer", "Review this");
    const call = client.calls.find((call) => call.method === "prompt.submit");
    expect(call?.params.text).toContain(JSON.stringify(context));
    expect(call?.params.text).toContain("grants no permission");
    expect(useSessionStore.getState().threads.engineer.transcript.messages[0].text).toBe("Review this");
    expect(client.calls.find((call) => call.method === "session.create")?.params).not.toHaveProperty("cwd");
  });

  it("captures the selected exact run before asynchronous work and carries it to ACP", async () => {
    const context = createRouteConversationContext({ pathname: "/workflows", search: "?run=older-exact-run" });
    publishConversationContext(context);
    const sending = useSessionStore.getState().send("acp:engineer", "Inspect");
    publishConversationContext(createRouteConversationContext({ pathname: "/home" }));
    await sending;
    expect(acp.submit).toHaveBeenCalledWith("acp-session", expect.stringContaining("older-exact-run"));
    expect(acp.submit.mock.calls[0][1]).not.toContain('"pathname":"/home"');
  });

  it("carries an explicitly shared unsaved workflow definition and selected node to ACP", async () => {
    const definition = createWorkflowDesignerDraft({ id: "unsaved-agent-draft", name: "New unsaved workflow" });
    const context = await workflowAgentDraftContext({ draftKey: "unsaved-agent-draft", currentDefinition: definition, selectedStepId: "step_1" }, { pathname: "/workflows", search: "?draft=unsaved-agent-draft" });
    publishConversationContext(context);
    await useSessionStore.getState().send("acp:engineer", "Propose a clearer review step");
    expect(acp.submit).toHaveBeenCalledWith("acp-session", expect.stringContaining(JSON.stringify(context)));
    expect(acp.submit.mock.calls[0][1]).toContain("propose_workflow_draft");
    expect(useSessionStore.getState().threads["acp:engineer"].transcript.messages[0].text).toBe("Propose a clearer review step");
  });

  it("keeps an ordinary prompt unchanged when no app context exists", async () => {
    await useSessionStore.getState().send("engineer", "Hello");
    expect(client.calls.find((call) => call.method === "prompt.submit")?.params.text).toBe("Hello");
  });
});
