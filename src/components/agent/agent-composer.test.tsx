// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { Composer } from "./agent-composer";
import { readPanelDraft, usePanelDraft } from "./panel-draft";
import { joinVoiceText } from "@/voice/use-voice";

it("keeps spaces and newlines through controlled typing, persistence and remount", async () => {
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  const profile = "composer-whitespace-regression";
  function Panel() {
    const { draft, setDraft } = usePanelDraft(profile);
    return <Composer draft={joinVoiceText(draft, "")} onDraft={setDraft} onSend={vi.fn()} onStop={vi.fn()} placeholder="Message" ready running={false} agent="Test" permission={null} />;
  }
  try {
    await act(async () => root.render(<Panel />));
    let expected = "";
    for (const character of "Hello  world\n  Next line ") {
      const input = host.querySelector("textarea")!;
      expected += character;
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, input.value + character);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      expect(input.value).toBe(expected);
      expect(readPanelDraft(profile).text).toBe(expected);
    }
    await act(async () => root.render(null));
    await act(async () => root.render(<Panel />));
    expect(host.querySelector("textarea")!.value).toBe(expected);
  } finally {
    await act(async () => root.unmount());
    host.remove(); localStorage.clear();
  }
});
