// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const acp = vi.hoisted(() => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  discover: vi.fn(),
  statuses: vi.fn(),
}));
const engineActions = vi.hoisted(() => ({ connect: vi.fn(), disconnect: vi.fn() }));

vi.mock("@/engine/acp-registry", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/engine/acp-registry")>();
  return {
    ...original,
    connectAcpProvider: acp.connect,
    disconnectAcpProvider: acp.disconnect,
    discoverAcpProviders: acp.discover,
    listAcpProviderStatuses: acp.statuses,
  };
});

vi.mock("@/engine/use-engine", () => ({
  connectEngine: engineActions.connect,
  disconnectEngine: engineActions.disconnect,
}));

import { useEngineStore } from "@/engine/engine-store";
import { ProvidersSettings } from "./providers";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Mounted {
  container: HTMLDivElement;
  root: Root;
  queryClient: QueryClient;
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

async function mount(): Promise<Mounted> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  await act(async () => {
    root.render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <ProvidersSettings />
        </QueryClientProvider>
      </MemoryRouter>,
    );
  });
  await settle();
  return { container, root, queryClient };
}

function button(panel: Mounted, label: string) {
  return Array.from(panel.container.querySelectorAll("button")).find((candidate) => candidate.textContent === label);
}

describe("Providers settings", () => {
  beforeEach(() => {
    acp.connect.mockReset().mockResolvedValue({ agentId: "provider-claude-code", sessionId: "session-1", pid: 42 });
    acp.disconnect.mockReset().mockResolvedValue(undefined);
    acp.statuses.mockReset().mockResolvedValue([]);
    engineActions.connect.mockReset().mockResolvedValue(undefined);
    engineActions.disconnect.mockReset().mockResolvedValue(undefined);
    acp.discover.mockReset().mockResolvedValue([
      {
        engine: "claude-code",
        label: "Claude Code",
        icon: "https://cdn.agentclientprotocol.com/registry/v1/latest/claude-acp.svg",
        command: "npx",
        args: ["--yes", "@agentclientprotocol/claude-agent-acp@0.73.0"],
        configured: 0,
        agentIds: [],
        available: true,
        adapterAvailable: false,
        cliAvailable: true,
        bridgeOnDemand: true,
        path: "/Users/test/.local/bin/claude",
        source: "ACP registry bridge",
      },
    ]);
    useEngineStore.setState({ connection: "closed", info: null, error: "offline" });
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it("offers one-click connection and explains that it creates the provider agent", async () => {
    const panel = await mount();
    expect(panel.container.textContent).toContain("Connect creates the default Claude Code agent.");
    const kind = Array.from(panel.container.querySelectorAll("span")).find((candidate) => candidate.textContent === "runs as itself");
    expect(kind?.className).toContain("var(--text)_10%");
    expect(kind?.querySelector('[aria-hidden="true"]')?.className).toContain("bg-[var(--runtime)]");
    const logo = panel.container.querySelector<HTMLElement>('[data-provider-icon="registry"]');
    expect(logo?.style.maskImage).toContain("claude-acp.svg");
    expect(logo?.className).toContain("bg-[var(--accent)]");
    const connect = Array.from(panel.container.querySelectorAll("button")).filter((candidate) => candidate.textContent === "Connect").at(-1);
    expect(connect).toBeDefined();
    await act(async () => connect!.click());
    expect(acp.connect).toHaveBeenCalledWith(expect.objectContaining({ engine: "claude-code" }));
    await act(async () => panel.root.unmount());
    panel.queryClient.clear();
  });

  it("invokes Hermes connection from its offline row", async () => {
    const panel = await mount();
    const connectButtons = Array.from(panel.container.querySelectorAll("button"))
      .filter((candidate) => candidate.textContent === "Connect");

    await act(async () => connectButtons[0]!.click());

    expect(engineActions.connect).toHaveBeenCalledTimes(1);
    expect(acp.connect).not.toHaveBeenCalled();
    await act(async () => panel.root.unmount());
    panel.queryClient.clear();
  });

  it("shows Hermes as connected when its gateway socket is open", async () => {
    useEngineStore.setState({
      connection: "open",
      info: {
        mode: "spawned",
        pid: 42,
        port: 56083,
        token: "token",
        version: "0.21.0",
        url: "http://127.0.0.1:56083",
      },
      error: null,
    });

    const panel = await mount();
    expect(panel.container.textContent).toContain("0.21.0 · 127.0.0.1:56083");
    expect(button(panel, "Disconnect")).toBeDefined();
    expect(Array.from(panel.container.querySelectorAll("button")).filter((candidate) => candidate.textContent === "Connect")).toHaveLength(1);
    await act(async () => panel.root.unmount());
    panel.queryClient.clear();
  });

  it("shows Disconnect when that provider has a live agent session", async () => {
    acp.discover.mockResolvedValue([
      {
        engine: "claude-code",
        label: "Claude Code",
        command: "npx",
        args: ["--yes", "@agentclientprotocol/claude-agent-acp@0.73.0"],
        configured: 1,
        agentIds: ["provider-claude-code"],
        available: true,
        adapterAvailable: false,
        cliAvailable: true,
        bridgeOnDemand: true,
        path: "/Users/test/.local/bin/claude",
        source: "ACP registry bridge",
      },
    ]);
    acp.statuses.mockResolvedValue([{ agentId: "provider-claude-code", sessionId: "session-1", pid: 42 }]);

    const panel = await mount();
    expect(panel.container.textContent).toContain("connected");
    const connected = Array.from(panel.container.querySelectorAll("span")).find((candidate) => candidate.textContent === "connected");
    expect(connected?.className).toContain("var(--ok)_14%");
    const disconnect = button(panel, "Disconnect");
    expect(disconnect).toBeDefined();
    await act(async () => disconnect!.click());
    expect(acp.disconnect).toHaveBeenCalledWith("claude-code");
    await act(async () => panel.root.unmount());
    panel.queryClient.clear();
  });

  it("rescans discovery and live status, then confirms completion", async () => {
    const panel = await mount();
    const discoveryCalls = acp.discover.mock.calls.length;
    const statusCalls = acp.statuses.mock.calls.length;

    await act(async () => button(panel, "Rescan")!.click());
    await settle();

    expect(acp.discover.mock.calls.length).toBeGreaterThan(discoveryCalls);
    expect(acp.statuses.mock.calls.length).toBeGreaterThan(statusCalls);
    expect(panel.container.textContent).toContain("Scan complete · 1 provider available");
    await act(async () => panel.root.unmount());
    panel.queryClient.clear();
  });
});
