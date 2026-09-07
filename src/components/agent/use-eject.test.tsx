// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { useEject } from "./use-eject";
import { emptyThread, useSessionStore } from "@/engine/session-store";
import { AGENT_PANEL_OPEN_EVENT } from "@/lib/agent-panel-persistence";
import { readPanelDraft, writePanelDraft } from "./panel-draft";
import { $groupChats } from "@/rooms/group-chat";
import { publishActionResult, publishFrame, type PanelAction } from "./panel-window";
import { FakeGatewayClient } from "@/engine/test-support";
import { setGatewayClient } from "@/engine/gateway";

const channel = vi.hoisted(() => ({ closed: null as (() => void) | null, action: null as ((action: PanelAction) => void) | null }));
vi.mock("@/lib/toast", () => ({ toastError: vi.fn() }));
vi.mock("@/lib/session-mode", () => ({
  readSessionMode: () => "not_today",
  useSessionMode: () => ({ ready: true, mode: "not_today" }),
}));
vi.mock("./panel-window", async (original) => ({
  ...await original<typeof import("./panel-window")>(),
  isTauri: true,
  readPanelDetached: () => false,
  writePanelDetached: vi.fn(), leaveHudHandoff: vi.fn(),
  panelWindowIsOpen: async () => false,
  openPanelWindow: async () => undefined,
  closePanelWindow: async () => undefined,
  onPanelClosed: async (handler: () => void) => { channel.closed = handler; return () => { channel.closed = null; }; },
  onAction: async (handler: (action: PanelAction) => void) => { channel.action = handler; return () => { channel.action = null; }; },
  publishFrame: vi.fn().mockResolvedValue(undefined),
  publishActionResult: vi.fn().mockResolvedValue(undefined),
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

it("returns a correlated room decision error so the detached question can retry", async () => {
  $groupChats.set({ team: { name: "Build team", owner: "local", log: [], watermarks: {}, members: [] } });
  const root = createRoot(document.createElement("div"));
  function Harness() { useEject(); return null; }
  const action = { type: "room-approve" as const, roomId: "team", memberKey: "keel", requestId: "stale", choice: "once" as const, receiptId: "stale:receipt" };
  try {
    await act(async () => root.render(<Harness />));
    await act(async () => { channel.action?.(action); await Promise.resolve(); });
    expect(vi.mocked(publishActionResult)).toHaveBeenCalledWith(action, expect.objectContaining({ message: expect.stringContaining("no longer pending") }));
  } finally {
    await act(async () => root.unmount());
    $groupChats.set({});
  }
});

it("routes a detached document decision back to the main document owner", async () => {
  const decide = vi.fn(async () => undefined);
  const review = { revision: 1, documentId: "doc", docPath: "vault:journal/doc.md", title: "Doc", proposals: [], busy: false, error: null };
  const decision = { documentId: "doc", docPath: "vault:journal/doc.md", proposalId: "proposal", taken: [], dropped: [{ id: 0, at: 1, old: ["before"], new: ["after"] }] };
  const action = { type: "document-proposal" as const, decision, receiptId: "doc:proposal:receipt" };
  const root = createRoot(document.createElement("div"));
  function Harness() { useEject(review, decide); return null; }
  try {
    await act(async () => root.render(<Harness />));
    await act(async () => { channel.action?.(action); await Promise.resolve(); await Promise.resolve(); });
    expect(decide).toHaveBeenCalledWith(decision);
    expect(vi.mocked(publishActionResult)).toHaveBeenCalledWith(action, undefined, undefined);
  } finally {
    await act(async () => root.unmount());
  }
});

it("reads approval settings through the selected main-owned profile and rejects stale scope", async () => {
  const client = new FakeGatewayClient();
  client.respondWith((call) => call.method === "config.get" ? { value: "manual" } : undefined);
  setGatewayClient(client as never);
  const profile = { name: "fiona", displayName: "Fiona", description: "", model: "model", provider: "Hermes", isDefault: true, gatewayRunning: true, avatarStyle: "sphere" as const };
  useSessionStore.setState({
    selectedProfile: "fiona",
    profileDirectory: { fiona: profile },
    threads: { fiona: { ...emptyThread("fiona"), sessionId: "session-1" } },
  });
  const root = createRoot(document.createElement("div"));
  function Harness() { useEject(); return null; }
  const current = { type: "approval-mode" as const, profile: "fiona", sessionId: "session-1", receiptId: "mode:1" };
  const stale = { ...current, sessionId: "old-session", receiptId: "mode:2" };
  try {
    await act(async () => root.render(<Harness />));
    await act(async () => { channel.action?.(current); await Promise.resolve(); await Promise.resolve(); });
    expect(client.callsTo("config.get")[0]?.params).toEqual({ key: "approvals.mode", profile: "fiona", session_id: "session-1" });
    expect(vi.mocked(publishActionResult)).toHaveBeenCalledWith(current, undefined, "manual");

    await act(async () => { channel.action?.(stale); await Promise.resolve(); await Promise.resolve(); });
    expect(client.callsTo("config.get")).toHaveLength(1);
    expect(vi.mocked(publishActionResult)).toHaveBeenCalledWith(stale, expect.objectContaining({ message: expect.stringContaining("session changed") }));
  } finally {
    await act(async () => root.unmount());
    setGatewayClient(null);
    useSessionStore.setState({ selectedProfile: null, profileDirectory: {}, threads: {} });
  }
});

it("publishes team updates while the docked panel is absent and retains the room on redock", async () => {
  $groupChats.set({ team: { name: "Build team", owner: "local", log: [], watermarks: {}, members: [] } });
  useSessionStore.getState().selectRoom("team");
  writePanelDraft("room:team", { text: "Unsent room draft", attachments: [] });
  const root = createRoot(document.createElement("div"));
  let eject!: ReturnType<typeof useEject>;
  function Harness() { eject = useEject(); return null; }
  try {
    await act(async () => root.render(<Harness />));
    await act(async () => eject.eject(true));
    expect(vi.mocked(publishFrame).mock.lastCall?.[0].sessionMode).toBe("not_today");
    await act(async () => $groupChats.set({ team: { ...$groupChats.get().team, running: true, turn: "Keel" } }));
    expect(vi.mocked(publishFrame).mock.lastCall?.[0].room).toMatchObject({ id: "team", room: { running: true, turn: "Keel" } });
    await act(async () => channel.closed?.());
    expect(useSessionStore.getState().selectedRoomId).toBe("team");
    expect(readPanelDraft("room:team").text).toBe("Unsent room draft");
  } finally {
    await act(async () => root.unmount());
    useSessionStore.getState().selectRoom(null);
    $groupChats.set({});
    localStorage.clear();
  }
});
