// @vitest-environment happy-dom
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { usePanelDraft } from "@/components/agent/panel-draft";
import { useSessionStore } from "@/engine/session-store";
import { requestAgentPanelOpen } from "@/lib/agent-panel-persistence";

vi.mock("@/engine/use-engine", () => ({ useEngineBoot: () => undefined }));
vi.mock("@/lib/use-hierarchy", () => ({ useHierarchy: () => ({ tree: [] }) }));
vi.mock("./sidebar", () => ({ Sidebar: () => null }));
vi.mock("@/components/home/home-pin-sync", () => ({ HomePinSync: () => null }));
vi.mock("sonner", () => ({ Toaster: () => null }));
vi.mock("./command-palette", () => ({ CommandPaletteProvider: ({ children }: { children: React.ReactNode }) => children, SHELL_COMMAND_EVENT: "fixture-shell-command" }));
vi.mock("./window-chrome", () => ({ isTauriRuntime: false, PANE_BG: "", PANE_BG_RAISED: "", PaneResizeEdges: () => null, WindowResizeHandles: () => null, useWindowDrag: () => () => undefined }));
const ejection = vi.hoisted(() => ({ ejected: false, busy: false, eject: vi.fn(), redock: vi.fn() }));
vi.mock("@/components/agent/use-eject", () => ({ useEject: () => ejection }));
vi.mock("./agent-panel", () => ({ AgentPanel: ({ overlay, onOverlayClose, onCollapsedChange }: { overlay?: boolean; onOverlayClose?: () => void; onCollapsedChange?: (collapsed: boolean) => void }) => {
  const target = useSessionStore((state) => state.selectedProfile);
  const { draft, setDraft } = usePanelDraft(target);
  useEffect(() => { if (!overlay) onCollapsedChange?.(false); }, [overlay, onCollapsedChange]);
  return <section aria-label="Fixture existing agent panel"><button onClick={onOverlayClose}>Collapse conversation</button><input aria-label="Fixture composer" value={draft} onChange={(event) => setDraft(event.target.value)} /></section>;
} }));
import { AppShell } from "./app-shell";

it("releases the panel space when detached and focuses it from the existing header control", async () => {
  window.innerWidth = 1440;
  window.localStorage.clear();
  ejection.ejected = true;
  const element = document.createElement("div");
  document.body.append(element);
  const root = createRoot(element);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    const render = () => root.render(<QueryClientProvider client={client}><MemoryRouter><AppShell /></MemoryRouter></QueryClientProvider>);
    await act(async () => render());
    expect(element.querySelector('[aria-label="Fixture existing agent panel"]')).toBeNull();
    expect(element.querySelector('.app-shell > main')?.nextElementSibling).toBeNull();
    const focus = element.querySelector<HTMLButtonElement>('[aria-label="Focus ejected agent panel"]')!;
    expect(focus.disabled).toBe(false);
    await act(async () => focus.click());
    expect(ejection.eject).toHaveBeenCalledOnce();
    ejection.ejected = false;
    await act(async () => render());
    expect(element.querySelector('[aria-label="Fixture existing agent panel"]')).toBeTruthy();
  } finally {
    await act(async () => root.unmount());
    element.remove(); client.clear(); ejection.ejected = false; ejection.eject.mockClear();
    window.localStorage.clear();
  }
});

it("reveals the existing conversation at 200% width, closes with Escape and restores its draft on explicit open", async () => {
  window.innerWidth = 590;
  window.localStorage.clear();
  window.localStorage.setItem("intelizen:agent-panel-collapsed", "1");
  useSessionStore.getState().selectProfile("acp:wave");
  const element = document.createElement("div");
  document.body.append(element);
  const root = createRoot(element);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter><AppShell /></MemoryRouter></QueryClientProvider>));
    const opener = element.querySelector<HTMLButtonElement>('button[aria-label="Show agent panel"]')!;
    expect(opener).toBeTruthy();
    expect(element.querySelector('[role="dialog"]')).toBeNull();
    opener.focus();
    await act(async () => opener.click());
    const dialog = element.querySelector('[role="dialog"][aria-label="Agent conversation"]');
    expect(dialog).toBeTruthy();
    expect(dialog?.contains(document.activeElement)).toBe(true);
    const composer = element.querySelector<HTMLInputElement>('[aria-label="Fixture composer"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(composer, "Keep this at 200%");
      composer.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(element.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
    await act(async () => requestAgentPanelOpen());
    expect(element.querySelector<HTMLInputElement>('[aria-label="Fixture composer"]')?.value).toBe("Keep this at 200%");
    expect(useSessionStore.getState().selectedProfile).toBe("acp:wave");
    await act(async () => element.querySelector<HTMLButtonElement>('button[aria-label="Hide agent panel"]')!.click());
    expect(element.querySelector('[role="dialog"]')).toBeNull();
  } finally {
    await act(async () => root.unmount()); element.remove(); client.clear();
    window.innerWidth = 1440; window.localStorage.clear(); useSessionStore.getState().selectProfile(null);
  }
});
