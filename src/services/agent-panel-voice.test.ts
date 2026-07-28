import { describe, expect, it, vi } from "vitest";

import {
  joinVoiceDraft,
  transcribeVoiceDraft,
} from "@/services/agent-panel-voice";

describe("agent panel voice client", () => {
  it("joins dictated text without corrupting the existing draft", () => {
    expect(joinVoiceDraft("Existing", " dictated text ")).toBe(
      "Existing dictated text",
    );
    expect(joinVoiceDraft("", " dictated text ")).toBe("dictated text");
  });

  it("keeps the original draft when transcription returns no speech", async () => {
    const transcribe = vi.fn().mockResolvedValue({ transcript: "" });
    await expect(
      transcribeVoiceDraft(new Blob(["audio"]), "Existing", transcribe),
    ).resolves.toEqual({ transcript: "", draft: "Existing" });
  });

  it("appends an observed Hermes transcript", async () => {
    const transcribe = vi.fn().mockResolvedValue({ transcript: "new words" });
    await expect(
      transcribeVoiceDraft(new Blob(["audio"]), "Existing", transcribe),
    ).resolves.toEqual({
      transcript: "new words",
      draft: "Existing new words",
    });
  });
});
