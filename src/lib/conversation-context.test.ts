import { describe, expect, it } from "vitest";

import {
  conversationContextForPrompt,
  conversationContextFromChatPayload,
  conversationContextReferences,
  createRouteConversationContext,
  deserializeConversationContext,
  omitConversationContextReference,
  parseConversationContext,
  promptWithConversationContext,
  visibleTextWithoutConversationContext,
} from "@/lib/conversation-context";

describe("conversation-context", () => {
  it("creates a versioned, app-owned route snapshot", () => {
    const snapshot = createRouteConversationContext(
      { pathname: "databases/db-1", search: "record=record-1", hash: "details" },
      "2026-07-14T10:00:00.000Z",
    );

    expect(snapshot).toEqual({
      version: 1,
      source: "main-app",
      route: {
        kind: "route",
        pathname: "/databases/db-1",
        search: "?record=record-1",
        hash: "#details",
      },
      selections: [],
      updatedAt: "2026-07-14T10:00:00.000Z",
    });
  });

  it("rejects malformed and unsupported snapshots", () => {
    expect(parseConversationContext({ version: 2 })).toBeNull();
    expect(deserializeConversationContext("not-json")).toBeNull();
    expect(deserializeConversationContext(JSON.stringify({ version: 1, source: "main-app" }))).toBeNull();
    const snapshot = createRouteConversationContext({ pathname: "/home" });
    expect(parseConversationContext({ ...snapshot, selections: [{ kind: "workspace_record" }] })).toBeNull();
  });

  it("round-trips a valid snapshot", () => {
    const snapshot = createRouteConversationContext({ pathname: "/home" }, "2026-07-14T10:00:00.000Z");
    expect(deserializeConversationContext(JSON.stringify(snapshot))).toEqual(snapshot);
  });

  it("recovers the exact snapshot from a durable chat payload", () => {
    const snapshot = createRouteConversationContext(
      { pathname: "/databases/db-1", search: "?record=record-1" },
      "2026-07-14T10:00:00.000Z",
    );
    const payload = {
      kind: "chat_message",
      context: {
        type: "agent_panel_chat",
        payload: { conversation_context: snapshot },
      },
    };

    expect(conversationContextFromChatPayload(payload)).toEqual(snapshot);
    expect(conversationContextFromChatPayload({ ...payload, context: { payload: { conversation_context: { version: 2 } } } })).toBeNull();
  });

  it("removes one reference and its redundant route value from the actual prompt", () => {
    const snapshot = {
      ...createRouteConversationContext(
        { pathname: "/databases/db-1", search: "?record=record-1&view=table" },
        "2026-07-14T10:00:00.000Z",
      ),
      selections: [
        { kind: "workspace_record" as const, databaseId: "db-1", recordId: "record-1", label: "First" },
        { kind: "document" as const, documentId: "doc-2", label: "Second" },
      ],
    };
    const [first] = conversationContextReferences(snapshot);
    const edited = omitConversationContextReference(snapshot, first.id);
    const outbound = conversationContextForPrompt(edited)!;

    expect(outbound.selections).toEqual([snapshot.selections[1]]);
    expect(outbound.route.search).toBe("?view=table");
    expect(outbound).not.toHaveProperty("omittedReferences");
    const prompt = promptWithConversationContext("Look at these", edited);
    expect(prompt).not.toContain("record-1");
    expect(prompt).toContain("doc-2");
    expect(visibleTextWithoutConversationContext(prompt)).toBe("Look at these");
  });

  it("removes whole material only for a route-only reference", () => {
    const snapshot = createRouteConversationContext({ pathname: "/home" });
    const [whole] = conversationContextReferences(snapshot);
    expect(whole.whole).toBe(true);
    expect(conversationContextForPrompt(omitConversationContextReference(snapshot, whole.id))).toBeNull();
  });

  it("keeps unrelated route metadata when the last individual reference is removed", () => {
    const snapshot = createRouteConversationContext({
      pathname: "/docs",
      search: "?record=doc-a&project=project-9&view=reading",
    });
    snapshot.selections = [{ kind: "document", documentId: "doc-a", label: "Brief" }];
    const [reference] = conversationContextReferences(snapshot);

    const edited = omitConversationContextReference(snapshot, reference.id);
    const outbound = conversationContextForPrompt(edited);

    expect(outbound?.selections).toEqual([]);
    expect(outbound?.route).toMatchObject({ pathname: "/docs", search: "?project=project-9&view=reading" });
    expect(outbound).not.toHaveProperty("label");
    expect(promptWithConversationContext("Continue", edited)).toContain('"search":"?project=project-9&view=reading"');
    const [route] = conversationContextReferences(edited);
    expect(route).toMatchObject({ kind: "route", label: "/docs?project=project-9&view=reading", whole: true });
    expect(conversationContextForPrompt(omitConversationContextReference(edited, route.id))).toBeNull();
  });

  it("removes a workflow draft reference while preserving unrelated workflow route context", () => {
    const snapshot = createRouteConversationContext({ pathname: "/workflows", search: "?draft=draft-a&project=project-9" });
    snapshot.label = "Draft A";
    snapshot.workflowDraft = {
      draftKey: "draft-a",
      baseRevision: "revision-a",
      definition: { id: "draft-a", name: "Draft A", schema: "intellizen.workflow/1", version: 1, inputs: [], trigger: { kind: "manual" }, steps: [] },
      selectedStepId: null,
      proposalTool: "propose_workflow_draft",
    };
    const [draft] = conversationContextReferences(snapshot);
    const edited = omitConversationContextReference(snapshot, draft.id);
    const outbound = conversationContextForPrompt(edited);

    expect(outbound?.workflowDraft).toBeUndefined();
    expect(outbound?.route.search).toBe("?project=project-9");
    expect(promptWithConversationContext("Continue", edited)).not.toContain("draft-a");
    expect(conversationContextReferences(edited)).toEqual([expect.objectContaining({
      kind: "route",
      label: "/workflows?project=project-9",
      whole: true,
    })]);
  });
});
