import { describe, expect, it } from "vitest";

import type { Message } from "@/engine/transcript";
import { agentTurnActions, errorReport, userTurnActions } from "./message-actions";

const reply = { id: "a", from: "Keel", text: "Done", prompt: "Do it", streaming: false } as Message;

describe("message actions", () => {
  it("offers finished replies the actions the current surface can perform", () => {
    expect(agentTurnActions(reply, { canRead: true, reading: false, canDocument: true, canSend: true }).map((action) => action.id)).toEqual([
      "copy",
      "read",
      "document",
      "ask-again",
    ]);
    expect(userTurnActions({ ...reply, from: "you" }, { canRead: false, reading: false, canDocument: false, canSend: true }).map((action) => action.id)).toEqual(["copy", "edit"]);
  });

  it("keeps enough context when a failed turn is copied", () => {
    expect(errorReport({ reason: "Timed out", agent: "Keel", provider: "ACP", model: "codex" })).toBe("Timed out\n\nKeel · ACP · codex");
  });
});
