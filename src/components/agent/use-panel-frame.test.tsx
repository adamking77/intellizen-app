// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { PanelFrame } from "./panel-window";
import { usePanelFrame } from "./use-panel-session";
const channel = vi.hoisted(() => ({ receive: null as ((frame: PanelFrame) => void) | null, read: vi.fn() }));
vi.mock("./panel-window", async (original) => ({ ...await original<typeof import("./panel-window")>(), onFrame: async (receive: (frame: PanelFrame) => void) => { channel.receive = receive; return () => { channel.receive = null; }; }, requestFrame: channel.read }));

it("recovers a missed initial event from the native handoff and never replaces newer live state with an older read", async () => {
  const host = document.createElement("div"), root = createRoot(host);
  const frame = (revision: number, selectedProfile: string): PanelFrame => ({ revision, selectedProfile, profileDirectory: {}, threads: {} });
  channel.read.mockResolvedValueOnce(frame(10, "acp:keel"));
  function Harness() { const current = usePanelFrame(); return <span>{current?.selectedProfile ?? "waiting"}</span>; }
  await act(async () => root.render(<Harness />));
  expect(host.textContent).toBe("acp:keel"); // No event was emitted.
  let finish!: (value: PanelFrame) => void;
  channel.read.mockImplementationOnce(() => new Promise<PanelFrame>((resolve) => { finish = resolve; }));
  await act(async () => window.dispatchEvent(new Event("focus")));
  await act(async () => channel.receive?.(frame(12, "fiona")));
  await act(async () => finish(frame(11, "acp:keel")));
  expect(host.textContent).toBe("fiona");
  await act(async () => root.unmount());
});
