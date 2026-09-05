// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from "vitest";

import {
  clearSessionPointer,
  readSessionPointer,
  transcriptFromHistory,
  writeSessionPointer,
} from "./session-continuity";

describe("panel session continuity", () => {
  beforeEach(() => window.localStorage.clear());

  it("stores only the Hermes pointer and reduced session metadata", () => {
    const pointer = {
      runtimeSessionId: "runtime-1",
      storedSessionId: "stored-1",
      usage: { total: 42 },
      approvalMode: "smart" as const,
    };
    writeSessionPointer("chief engineer", pointer);
    expect(readSessionPointer("chief engineer")).toEqual(pointer);
    clearSessionPointer("chief engineer");
    expect(readSessionPointer("chief engineer")).toBeNull();
  });

  it("projects durable rows without inventing live state", () => {
    const transcript = transcriptFromHistory("fiona", [
      { role: "user", text: "Question", timestamp: 10 },
      { role: "assistant", text: "Answer", reasoning: "Because" },
      { role: "tool", name: "terminal", context: "pwd", text: "Error: permission denied" },
      { role: "system", text: "A durable note" },
    ]);
    expect(transcript.messages.map((message) => [message.from, message.text])).toEqual([
      ["you", "Question"],
      ["fiona", "Answer"],
      ["fiona", "A durable note"],
    ]);
    expect(transcript.messages[1].thought).toBe("Because");
    expect(transcript.messages[1].tools?.[0]).toMatchObject({ name: "terminal", title: "pwd", historical: true, resultText: "Error: permission denied" });
    expect(transcript.messages[1].tools?.[0].ok).toBeUndefined();
    expect(transcript.messages[0].at).toBe(10_000);
    expect(transcript.turnStartedAt).toBeNull();
  });
});
