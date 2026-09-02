// @vitest-environment happy-dom

import { act, Profiler } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  toastError: vi.fn(),
  errorMessage: (e: unknown) => String(e),
}));

vi.mock("@/lib/clipboard", () => ({
  writeTextToClipboard: vi.fn(async () => undefined),
}));

const acpDisk = vi.hoisted(() => ({ text: "" }));
vi.mock("@tauri-apps/plugin-fs", () => ({
  BaseDirectory: { AppData: 1 },
  exists: async (path: string) => path === "acp-agents.json" && acpDisk.text.length > 0,
  readTextFile: async () => acpDisk.text,
}));

import { AgentPanel } from "@/components/layout/agent-panel";
import { resetAcpSubscription, setAcpBridge, type AcpEnvelope } from "@/engine/acp-session";
import { useEngineStore } from "@/engine/engine-store";
import { setGatewayClient } from "@/engine/gateway";
import type { JsonRpcGatewayClient } from "@/engine/json-rpc-gateway";
import { resetSessionStoreSubscription, useSessionStore } from "@/engine/session-store";
import { FakeGatewayClient, loadProfilesList, loadTurn, turnEvents } from "@/engine/test-support";
import { AGENT_PANEL_COLLAPSED_KEY } from "@/lib/agent-panel-persistence";

interface Mounted {
  container: HTMLDivElement;
  root: Root;
  unmount: () => Promise<void>;
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

async function mountPanel(mode: "docked" | "standalone" = "docked"): Promise<Mounted> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Number.POSITIVE_INFINITY } },
  });
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <AgentPanel mode={mode} onEject={() => undefined} />
      </QueryClientProvider>,
    );
  });
  await settle();
  await settle();
  return {
    container,
    root,
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
      queryClient.clear();
    },
  };
}

function textarea(panel: Mounted) {
  return panel.container.querySelector<HTMLTextAreaElement>("textarea")!;
}

async function type(panel: Mounted, value: string) {
  const el = textarea(panel);
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function pressEnter(panel: Mounted) {
  await act(async () => {
    textarea(panel).dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  await settle();
}

describe("AgentPanel on the gateway", () => {
  let client: FakeGatewayClient;

  beforeEach(() => {
    window.innerWidth = 1440;
    window.localStorage.clear();
    window.localStorage.setItem(AGENT_PANEL_COLLAPSED_KEY, "0");
    client = new FakeGatewayClient();
    client.respondWith((call) => (call.method === "profiles.list" ? loadProfilesList().result : undefined));
    resetSessionStoreSubscription();
    setGatewayClient(client as unknown as JsonRpcGatewayClient);
    useSessionStore.setState({ selectedProfile: null, threads: {} });
    useEngineStore.setState({ connection: "open", info: null, error: null });
    acpDisk.text = "";
  });

  afterEach(() => {
    setGatewayClient(null);
    resetSessionStoreSubscription();
    setAcpBridge(null);
    resetAcpSubscription();
  });

  it("renders the collapsed docked pill", async () => {
    window.localStorage.setItem(AGENT_PANEL_COLLAPSED_KEY, "1");
    const panel = await mountPanel();
    expect(panel.container.querySelector('button[aria-label="Expand agent panel"]')).not.toBeNull();
    expect(panel.container.querySelector("textarea")).toBeNull();
    await panel.unmount();
  });

  it("starts on the profile Hermes marks default and lists the rest in the picker", async () => {
    const panel = await mountPanel();
    const trigger = panel.container.querySelector<HTMLButtonElement>('button[aria-haspopup="listbox"]')!;
    expect(trigger.textContent).toContain("default");
    expect(panel.container.querySelector('[data-panel-state="empty"]')?.textContent).toContain("Ready — default can answer.");
    await act(async () => trigger.click());
    const options = Array.from(panel.container.querySelectorAll<HTMLButtonElement>('[role="option"]'));
    expect(options.map((o) => o.textContent)).toEqual([
      "defaultdeepseek-v4-flashdefault",
      "fionagpt-5.6-sol",
      "hr-agentdeepseek-v4-flash-vision-exp",
      "islaMiniMax-M3",
      "keelgpt-5.6-sol",
      "nashgpt-5.6-sol",
      "rookgpt-5.6-sol",
    ]);
    expect(options[0].getAttribute("aria-selected")).toBe("true");
    await act(async () => options[1].click());
    expect(panel.container.querySelector('[role="listbox"]')).toBeNull();
    expect(trigger.textContent).toContain("fiona");
    await panel.unmount();
  });

  it("sends a turn with Enter, streams the recorded reply, and shows the tool row and run status", async () => {
    const turn = loadTurn("default-date-turn");
    client.respondWith((call) => (call.method === "session.create" ? { session_id: turn.sessionId } : undefined));
    const panel = await mountPanel();
    await type(panel, turn.prompt);
    await pressEnter(panel);
    expect(client.calls.map((c) => c.method)).toEqual(["profiles.list", "session.create", "prompt.submit"]);
    expect(client.calls[1].params).toEqual({ cols: 96, source: "desktop", profile: "default" });
    expect(client.calls[2].params).toEqual({ session_id: turn.sessionId, text: turn.prompt });
    expect(textarea(panel).value).toBe("");
    expect(panel.container.querySelector('[data-run-state="working"]')).not.toBeNull();
    expect(panel.container.querySelector('button[aria-label="Stop this turn"]')).not.toBeNull();

    const events = turnEvents(turn);
    const startAt = events.findIndex((e) => e.event.type === "tool.start");
    await act(async () => {
      for (const { event } of events.slice(0, startAt + 1)) client.emit(event);
    });
    expect(panel.container.textContent).toContain("date");
    expect(panel.container.textContent).toContain("running");

    await act(async () => {
      for (const { event } of events.slice(startAt + 1)) client.emit(event);
    });
    const text = panel.container.textContent ?? "";
    expect(text).toContain("The current date is");
    expect(text).toContain("197 ms");
    expect(text).toContain("ok");
    expect(panel.container.querySelector('[data-run-state="done"]')?.textContent).toMatch(/Done in \d+ s/);
    expect(panel.container.querySelector('button[aria-label="Speaking is switched off in Settings"]')).not.toBeNull();
    expect(text).toContain("Ask first");
    // Inline markdown in the reply renders as elements, not literal marks.
    expect(panel.container.querySelector("strong")?.textContent).toBe("Wed Sep 2 10:05:48 +04 2026");
    expect(text).not.toContain("**");
    await panel.unmount();
  });

  it("renders the approval gate with Hermes's choices and settles it into a fact line", async () => {
    const turn = loadTurn("default-approval-turn");
    client.respondWith((call) => (call.method === "session.create" ? { session_id: turn.sessionId } : undefined));
    client.respondWith((call) => (call.method === "approval.respond" ? { resolved: 1 } : undefined));
    const panel = await mountPanel();
    await type(panel, turn.prompt);
    await pressEnter(panel);

    const events = turnEvents(turn);
    const at = events.findIndex((e) => e.event.type === "approval.request");
    await act(async () => {
      for (const { event } of events.slice(0, at + 1)) client.emit(event);
    });
    const card = panel.container.querySelector('[data-decision="approval"]')!;
    expect(card).not.toBeNull();
    expect(card.textContent).toContain("This step needs your confirmation");
    expect(card.querySelector("pre")?.textContent).toBe("cd /tmp && rm -rf iz-approval-dir");
    expect(card.textContent).toContain("recursive delete");
    const buttons = Array.from(card.querySelectorAll("button")).map((b) => b.textContent);
    expect(buttons).toEqual(["Allow once", "Allow this session", "Always allow", "Deny"]);
    expect(panel.container.querySelector('[data-run-state="waiting"]')?.textContent).toContain("waiting on you");

    await act(async () => card.querySelector<HTMLButtonElement>("button")!.click());
    await settle();
    expect(client.callsTo("approval.respond")[0].params).toEqual({
      session_id: turn.sessionId,
      request_id: "a2e15e7326f54a6d908cc9ad88c4ce8f",
      choice: "once",
    });
    expect(panel.container.querySelector('[data-decision="approval"]')).toBeNull();
    expect(panel.container.textContent).toContain("Allowed once · cd /tmp && rm -rf iz-approval-dir");

    await act(async () => {
      for (const { event } of events.slice(at + 1)) client.emit(event);
    });
    expect(panel.container.textContent).toContain("ran cleanly with exit code 0");
    expect(panel.container.querySelector('[data-run-state="done"]')).not.toBeNull();
    await panel.unmount();
  });

  it("disables the composer with honest copy while the engine is offline", async () => {
    useEngineStore.setState({ connection: "error", info: null, error: "hermes serve exited (code 1)" });
    const panel = await mountPanel();
    const el = textarea(panel);
    expect(el.disabled).toBe(true);
    expect(el.placeholder).toBe("Hermes is offline");
    const empty = panel.container.querySelector('[data-panel-state="error"]');
    expect(empty?.textContent).toContain("Hermes is offline.");
    expect(empty?.textContent).toContain("hermes serve exited (code 1)");
    expect(client.callsTo("profiles.list")).toHaveLength(0);
    await panel.unmount();
  });

  it("chats with an ACP agent while Hermes is offline", async () => {
    useEngineStore.setState({ connection: "error", info: null, error: "Hermes stopped" });
    acpDisk.text = JSON.stringify([{ id: "cc", name: "Claude Code", engine: "claude-code", command: "claude-agent-acp", args: [] }]);
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    let emit: ((event: AcpEnvelope) => void) | null = null;
    setAcpBridge({
      invoke: async <T,>(command: string, args?: Record<string, unknown>) => {
        calls.push({ command, args });
        return (command === "acp_start" ? { agentId: "cc", sessionId: "acp-1", pid: 42 } : undefined) as T;
      },
      listen: async (handler) => {
        emit = handler;
        return () => {
          emit = null;
        };
      },
    });

    const panel = await mountPanel();
    expect(panel.container.querySelector('button[aria-haspopup="listbox"]')?.textContent).toContain("Claude Code");
    expect(textarea(panel).disabled).toBe(false);
    expect(textarea(panel).placeholder).toContain("Message Claude Code");
    await type(panel, "hello");
    await pressEnter(panel);
    expect(calls.slice(0, 2)).toEqual([
      { command: "acp_start", args: { agentId: "cc" } },
      { command: "acp_prompt", args: { agentId: "cc", text: "hello" } },
    ]);
    await act(async () => {
      emit?.({ agent_id: "cc", type: "message.start", session_id: "acp-1", payload: {} });
      emit?.({ agent_id: "cc", type: "message.delta", session_id: "acp-1", payload: { text: "Hi Adam" } });
      emit?.({ agent_id: "cc", type: "message.complete", session_id: "acp-1", payload: { status: "complete" } });
    });
    expect(panel.container.textContent).toContain("Hi Adam");
    await panel.unmount();
  });

  it("says the engine is starting while it connects", async () => {
    useEngineStore.setState({ connection: "connecting", info: null, error: null });
    const panel = await mountPanel();
    expect(textarea(panel).placeholder).toBe("Starting Hermes…");
    expect(panel.container.querySelector('[data-panel-state="loading"]')).not.toBeNull();
    await panel.unmount();
  });

  it("marks a failed turn and offers to ask again", async () => {
    client.respondWith((call) => {
      if (call.method === "prompt.submit") throw new Error("gateway not connected");
      return undefined;
    });
    const panel = await mountPanel();
    await type(panel, "hello");
    await pressEnter(panel);
    await settle();
    expect(panel.container.textContent).toContain("gateway not connected");
    expect(panel.container.querySelector('[data-run-state="failed"]')).not.toBeNull();
    expect(Array.from(panel.container.querySelectorAll("button")).some((b) => b.textContent === "Ask again")).toBe(true);
    await panel.unmount();
  });

  it("settles in a bounded number of commits when the engine is open and a turn streams", async () => {
    // The connected path: profiles resolve, the default profile is selected,
    // a thread appears, forty-odd events stream in. A selector that mints a
    // fresh object per render loops here ("Maximum update depth exceeded").
    const turn = loadTurn("default-date-turn");
    client.respondWith((call) => (call.method === "session.create" ? { session_id: turn.sessionId } : undefined));
    const errors: string[] = [];
    const consoleError = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      errors.push(args.map(String).join(" "));
    });
    let commits = 0;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <Profiler id="panel" onRender={() => { commits += 1; }}>
            <AgentPanel mode="docked" />
          </Profiler>
        </QueryClientProvider>,
      );
    });
    await settle();
    await settle();
    const afterMount = commits;
    expect(afterMount).toBeLessThan(12);
    expect(container.querySelector('button[aria-haspopup="listbox"]')?.textContent).toContain("default");

    const panel: Mounted = { container, root, unmount: async () => undefined };
    await type(panel, turn.prompt);
    await pressEnter(panel);
    await act(async () => {
      for (const { event } of turnEvents(turn)) client.emit(event);
    });
    await settle();
    expect(container.textContent).toContain("The current date is");
    // One commit per rendered event is the ceiling; a loop would be hundreds.
    expect(commits - afterMount).toBeLessThan(turnEvents(turn).length + 12);
    expect(errors.filter((e) => /Maximum update depth|Should not already be working/.test(e))).toEqual([]);
    expect(client.callsTo("profiles.list")).toHaveLength(1);
    consoleError.mockRestore();
    await act(async () => root.unmount());
    container.remove();
    queryClient.clear();
  });

  it("mounts the same panel in the standalone window", async () => {
    const panel = await mountPanel("standalone");
    expect(panel.container.querySelector('[data-panel-mode="standalone"]')).not.toBeNull();
    expect(panel.container.querySelector('button[aria-label="Collapse agent panel"]')).toBeNull();
    await panel.unmount();
  });
});
