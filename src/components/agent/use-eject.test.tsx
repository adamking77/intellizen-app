// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { useEject } from "./use-eject";
import { useSessionStore } from "@/engine/session-store";
import { AGENT_PANEL_OPEN_EVENT } from "@/lib/agent-panel-persistence";
import { readPanelDraft, writePanelDraft } from "./panel-draft";

const channel = vi.hoisted(() => ({ closed: null as (() => void) | null }));
vi.mock("@/lib/toast", () => ({ toastError: vi.fn() }));
vi.mock("./panel-window", async (original) => ({
  ...await original<typeof import("./panel-window")>(),
  isTauri: true,
  readPanelDetached: () => false,
  writePanelDetached: vi.fn(), leaveHudHandoff: vi.fn(),
  panelWindowIsOpen: async () => false,
  openPanelWindow: async () => undefined,
  closePanelWindow: async () => undefined,
  onPanelClosed: async (handler: () => void) => { channel.closed = handler; return () => { channel.closed = null; }; },
  onFrameRequest: async () => () => undefined,
  onAction: async () => () => undefined,
  publishFrame: vi.fn(),
}));

it("reveals the docked conversation after the detached window closes without changing target or draft", async () => {
  const element = document.createElement("div");
  const root = createRoot(element);
  let eject!: ReturnType<typeof useEject>;
  const revealed = vi.fn();
  window.addEventListener(AGENT_PANEL_OPEN_EVENT, revealed);
  useSessionStore.getState().selectProfile("acp:wave");
  writePanelDraft("acp:wave", { text: "Unsent QA draft", attachments: [] });
  function Harness() { eject = useEject(); return <span>{eject.ejected ? "detached" : "docked"}</span>; }
  try {
    await act(async () => root.render(<Harness />));
    await act(async () => eject.eject());
    expect(element.textContent).toBe("detached");
    expect(revealed).not.toHaveBeenCalled();
    await act(async () => channel.closed?.());
    expect(element.textContent).toBe("docked");
    expect(revealed).toHaveBeenCalledTimes(1);
    expect(useSessionStore.getState().selectedProfile).toBe("acp:wave");
    expect(readPanelDraft("acp:wave").text).toBe("Unsent QA draft");
  } finally {
    await act(async () => root.unmount());
    window.removeEventListener(AGENT_PANEL_OPEN_EVENT, revealed);
    useSessionStore.getState().selectProfile(null);
    window.localStorage.clear();
  }
});
