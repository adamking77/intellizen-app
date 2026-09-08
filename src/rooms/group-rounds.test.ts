import { describe, expect, it } from "vitest";

import {
  conversationContextReferences,
  createRouteConversationContext,
  omitConversationContextReference,
} from "@/lib/conversation-context";
import { buildGroupChatTurnPrompt } from "./group-rounds";

describe("local room context", () => {
  it("adds only the references still shared to the hidden member prompt", () => {
    const context = createRouteConversationContext({ pathname: "/docs", search: "?record=doc-a" });
    context.selections = [
      { kind: "document", documentId: "doc-a", label: "Remove" },
      { kind: "document", documentId: "doc-b", label: "Keep" },
    ];
    const [removed] = conversationContextReferences(context);
    const prompt = buildGroupChatTurnPrompt({
      context: omitConversationContextReference(context, removed.id),
      groupName: "Review",
      members: [
        { name: "fable", door: "gateway" },
        { name: "keel", door: "gateway" },
      ],
      viewer: { name: "fable", door: "gateway" },
      deltaLines: ["You (user): Review this"],
    });

    expect(prompt).toContain("You (user): Review this");
    expect(prompt).not.toContain("doc-a");
    expect(prompt).toContain("doc-b");
  });
});
