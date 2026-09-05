// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { RoomComposer } from "./room-composer";
import { SEND_ON_ENTER_KEY } from "@/lib/settings-preferences";

vi.mock("@/voice/use-voice", async (original) => ({
  ...await original<typeof import("@/voice/use-voice")>(),
  useVoice: () => ({ mine: false, hearing: false, interim: "", note: null, convo: false, canConverse: false, dictationOn: false }),
}));
afterEach(() => { localStorage.clear(); document.body.replaceChildren(); });

async function mount(options: { running?: boolean; onSend?: (text: string) => Promise<void> } = {}) {
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host), onSend = options.onSend ?? vi.fn(), onStop = vi.fn();
  await act(async () => root.render(<RoomComposer members={[{ name: "fiona", door: "gateway", display_name: "Fiona" }]} running={options.running ?? false} onSend={onSend} onStop={onStop} name="Design team" />));
  const textarea = host.querySelector("textarea")!;
  return {
    host, textarea, onSend, onStop,
    async type(value: string) {
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, value);
        textarea.selectionStart = textarea.selectionEnd = value.length;
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
      });
    },
    async key(key: string, options: KeyboardEventInit = {}) {
      await act(async () => { textarea.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options })); });
    },
    async close() { await act(async () => root.unmount()); },
  };
}

it("completes a team mention before sending and preserves its trailing space", async () => {
  const ui = await mount();
  try {
    await ui.type("@fi");
    expect(ui.host.querySelector('[role="listbox"]')).toBeTruthy();
    await ui.key("Enter");
    expect(ui.textarea.value).toBe("@fiona ");
    expect(ui.onSend).not.toHaveBeenCalled();
    await ui.type("@fiona Review this");
    await ui.key("Enter");
    expect(ui.onSend).toHaveBeenCalledExactlyOnceWith("@fiona Review this");
    expect(ui.textarea.value).toBe("");
  } finally { await ui.close(); }
});

it("honors the app send shortcut and keeps an unsuccessful draft", async () => {
  localStorage.setItem(SEND_ON_ENTER_KEY, "0");
  const onSend = vi.fn().mockRejectedValue(new Error("Offline"));
  const ui = await mount({ onSend });
  try {
    await ui.type("Keep this draft");
    await ui.key("Enter");
    expect(onSend).not.toHaveBeenCalled();
    await ui.key("Enter", { metaKey: true });
    expect(onSend).toHaveBeenCalledExactlyOnceWith("Keep this draft");
    expect(ui.textarea.value).toBe("Keep this draft");
  } finally { await ui.close(); }
});

it("does not send during a team turn and exposes the shared Stop control", async () => {
  const ui = await mount({ running: true });
  try {
    await ui.type("Next thought");
    await ui.key("Enter");
    expect(ui.onSend).not.toHaveBeenCalled();
    await act(async () => (ui.host.querySelector('[aria-label="Stop this turn"]') as HTMLButtonElement).click());
    expect(ui.onStop).toHaveBeenCalledOnce();
  } finally { await ui.close(); }
});
