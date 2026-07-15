import { describe, expect, it } from "vitest";

import {
  conversationContextFromChatPayload,
  createRouteConversationContext,
  deserializeConversationContext,
  parseConversationContext,
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
});
