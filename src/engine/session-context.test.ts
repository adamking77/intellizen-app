// @vitest-environment happy-dom
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { emptyThread, useSessionStore } from "./session-store";
import { setGatewayClient } from "./gateway";
import type { JsonRpcGatewayClient } from "./json-rpc-gateway";
import { FakeGatewayClient } from "./test-support";
import {
  conversationContextReferences,
  createRouteConversationContext,
  omitConversationContextReference,
  publishConversationContext,
} from "@/lib/conversation-context";
import { workflowAgentDraftContext } from "@/lib/workflow-agent-draft";
import { createWorkflowDesignerDraft } from "@/lib/workflow-designer";
import type { ApprovalDecision, ClarifyDecision } from "./transcript";
import { writeSessionPointer } from "./session-continuity";

const acp = vi.hoisted(() => ({ submit: vi.fn(async (_session: string, _prompt: string) => undefined) }));
vi.mock("./acp-session", () => ({
  createAcpSession: vi.fn(async () => "acp-session"),
  onAcpEvent: () => () => {},
  submitAcpPrompt: acp.submit,
  interruptAcpSession: vi.fn(), respondAcpApproval: vi.fn(),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

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

  it("reports the exact new message after restoring identical historical text", async () => {
    writeSessionPointer("engineer", {
      runtimeSessionId: "runtime-restored",
      storedSessionId: "stored-restored",
      usage: null,
      approvalMode: null,
    });
    client.respondWith((call) => call.method === "session.history"
      ? { messages: [{ role: "user", text: "Repeat this" }] }
      : call.method === "session.events.since" ? { events: [] } : undefined);
    const queued = vi.fn();

    await useSessionStore.getState().send("engineer", "Repeat this", [], null, { onQueued: queued });

    expect(useSessionStore.getState().threads.engineer.transcript.messages.map((message) => message.id)).toEqual(["t1", "t2"]);
    expect(queued).toHaveBeenCalledExactlyOnceWith("t2", "runtime-restored");
  });

  it("uses a captured edited context even when the current route changes before dispatch", async () => {
    const context = createRouteConversationContext({ pathname: "/docs", search: "?record=document-b" });
    context.selections = [
      { kind: "document", documentId: "document-b", label: "Remove me" },
      { kind: "document", documentId: "document-c", label: "Keep me" },
    ];
    const [removed] = conversationContextReferences(context);
    const captured = omitConversationContextReference(context, removed.id);
    publishConversationContext(createRouteConversationContext({ pathname: "/home" }));

    await useSessionStore.getState().send("engineer", "Review this", [], captured);

    const text = String(client.calls.find((call) => call.method === "prompt.submit")?.params.text);
    expect(text).not.toContain("document-b");
    expect(text).toContain("document-c");
    expect(text).not.toContain('"pathname":"/home"');
  });

  it("rejects stale single-agent decisions before contacting the gateway", async () => {
    useSessionStore.setState({
      threads: {
        engineer: { ...emptyThread("engineer"), sessionId: "session-1" },
      },
    });
    const approval: ApprovalDecision = {
      kind: "approval",
      requestId: "stale-approval",
      command: "publish",
      description: "Publish the result",
      choices: ["once", "deny"],
      messageId: "m1",
      at: 1,
    };
    const clarify: ClarifyDecision = {
      kind: "clarify",
      requestId: "stale-clarify",
      questions: [{ question: "Which?", choices: ["A", "B"], multiSelect: false }],
      messageId: "m1",
      at: 1,
    };

    await expect(useSessionStore.getState().decideApproval("engineer", approval, "once")).rejects.toThrow("no longer pending");
    await expect(useSessionStore.getState().decideClarify("engineer", clarify, { "0": ["A"] })).rejects.toThrow("no longer pending");
    expect(client.calls).toEqual([]);
  });

  it("serializes decisions per profile before gateway dispatch", async () => {
    const first: ApprovalDecision = {
      kind: "approval", requestId: "approval-1", command: "first", description: "First", choices: ["once"], messageId: "m1", at: 1,
    };
    const second: ApprovalDecision = { ...first, requestId: "approval-2", command: "second", messageId: "m2" };
    const thread = { ...emptyThread("engineer"), sessionId: "session-1" };
    thread.transcript.pending = [first, second];
    useSessionStore.setState({ threads: { engineer: thread } });
    const response = deferred<{ resolved: number }>();
    client.respondWith((call) => call.method === "approval.respond" ? response.promise : undefined);

    const sending = useSessionStore.getState().decideApproval("engineer", first, "once");
    await Promise.resolve();
    await expect(useSessionStore.getState().decideApproval("engineer", first, "once")).rejects.toThrow("already being sent");
    await expect(useSessionStore.getState().decideApproval("engineer", second, "once")).rejects.toThrow("already being sent");
    expect(client.calls.filter((call) => call.method === "approval.respond")).toHaveLength(1);
    expect(useSessionStore.getState().threads.engineer.deciding).toBe("approval-1");

    response.resolve({ resolved: 1 });
    await sending;
    expect(useSessionStore.getState().threads.engineer.deciding).toBeNull();
    expect(useSessionStore.getState().threads.engineer.transcript.pending.map((item) => item.requestId)).toEqual(["approval-2"]);
  });

  it("rejects a duplicate clarification while its first answer is in flight", async () => {
    const decision: ClarifyDecision = {
      kind: "clarify", requestId: "clarify-1", questions: [{ question: "Which?", choices: ["A"], multiSelect: false }], messageId: "m1", at: 1,
    };
    const thread = { ...emptyThread("engineer"), sessionId: "session-1" };
    thread.transcript.pending = [decision];
    useSessionStore.setState({ threads: { engineer: thread } });
    const response = deferred<{ status: string }>();
    client.respondWith((call) => call.method === "clarify.respond" ? response.promise : undefined);

    const sending = useSessionStore.getState().decideClarify("engineer", decision, { "0": ["A"] });
    await Promise.resolve();
    await expect(useSessionStore.getState().decideClarify("engineer", decision, { "0": ["A"] })).rejects.toThrow("already being sent");
    expect(client.calls.filter((call) => call.method === "clarify.respond")).toHaveLength(1);

    response.resolve({ status: "answered" });
    await sending;
    expect(useSessionStore.getState().threads.engineer.deciding).toBeNull();
  });
});
