// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AgentPanel } from "@/components/layout/agent-panel";
import {
  AGENT_PANEL_COLLAPSED_KEY,
} from "@/lib/agent-panel-persistence";
import {
  PANEL_SELECTED_ROLE_KEY,
  panelRoleStorageKey,
  type AgentPanelRoleTarget,
} from "@/lib/agent-panel-roles";

const harness = vi.hoisted(() => ({
  activeWork: {} as Record<string, unknown[]>,
  roleError: null as Error | null,
  roleTargets: [] as unknown[],
  sendChat: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  emit: vi.fn(async () => undefined),
}));

vi.mock("@/store", () => ({
  useAppStore: (
    selector: (state: { entityFilter: string }) => unknown,
  ) => selector({ entityFilter: "genzen" }),
}));

vi.mock("@/lib/data", () => ({
  createVoiceDraftTask: vi.fn(),
  GENZEN_WORKSPACE_DATABASE_IDS: {
    tasks: "tasks",
    workflowRuns: "workflow-runs",
  },
  listFionaInboxItems: vi.fn(async () => []),
  listWorkflows: vi.fn(async () => []),
  OPERATOR_ACTOR: "Adam",
}));

vi.mock("@/lib/use-start-workflow", () => ({
  useStartWorkflow: () => ({
    isStartingWorkflow: false,
    start: vi.fn(async () => null),
  }),
}));

vi.mock("@/services/agent-panel-roles", () => ({
  listAgentPanelRoleTargets: vi.fn(async () => {
    if (harness.roleError) throw harness.roleError;
    return harness.roleTargets;
  }),
}));

vi.mock("@/services/active-work", () => ({
  inspectActiveWork: vi.fn(async () => harness.activeWork),
}));

vi.mock("@/services/agent", () => ({
  checkHermesApi: vi.fn(async () => false),
  DEFAULT_HERMES_PROFILE: "fiona",
  fetchHermesProfiles: vi.fn(async () => []),
}));

vi.mock("@/services/agent-panel-chat", () => ({
  sendAgentPanelChatMessage: (
    input: { signal: AbortSignal },
  ) => harness.sendChat(input),
}));

vi.mock("@/services/voice", () => ({
  getPreferredVoiceInputProvider: () => null,
  getPreferredVoiceOutputProvider: () => null,
  getVoiceProviderStatus: () => [],
  speakWithHermes: vi.fn(),
  startBrowserDictation: () => null,
  supportsBrowserSpeechSynthesis: () => false,
  transcribeWithHermes: vi.fn(),
}));

vi.mock("@/lib/supabase", () => {
  const channel = {
    on: () => channel,
    subscribe: () => channel,
  };
  return {
    supabase: {
      channel: () => channel,
      removeChannel: vi.fn(async () => undefined),
    },
  };
});

const readyRole: AgentPanelRoleTarget = {
  roleKey: "chief_engineer",
  roleName: "Chief Engineer",
  roleRecordId: "role-keel",
  agentKey: "keel",
  agentName: "Keel",
  agentRecordId: "agent-keel",
  bindingRef: "codex-local-primary",
  adapterId: "codex-cli",
  model: "gpt-5.6-sol",
  execution: "ephemeral",
  state: "ready",
};

const unavailableRole: AgentPanelRoleTarget = {
  ...readyRole,
  agentKey: null,
  agentName: null,
  agentRecordId: null,
  bindingRef: null,
  adapterId: null,
  model: null,
  execution: null,
  state: "unavailable",
};

interface MountedPanel {
  container: HTMLDivElement;
  root: Root;
  unmount: () => Promise<void>;
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

async function mountPanel(
  mode: "docked" | "standalone" = "docked",
): Promise<MountedPanel> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
    },
  });
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AgentPanel mode={mode} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  });
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

function selectReadyRole(role: AgentPanelRoleTarget = readyRole) {
  harness.roleTargets = [role];
  window.localStorage.setItem(AGENT_PANEL_COLLAPSED_KEY, "0");
  window.localStorage.setItem(PANEL_SELECTED_ROLE_KEY, role.roleKey);
}

describe("AgentPanel integrated coordinator mount", () => {
  beforeEach(() => {
    window.localStorage.clear();
    harness.activeWork = {};
    harness.roleError = null;
    harness.roleTargets = [];
    harness.sendChat.mockReset();
    harness.sendChat.mockResolvedValue({
      kind: "streamed",
      provider: "local-runtime",
      text: "ok",
      widgets: [],
      usage: null,
    });
  });

  it("renders the collapsed docked control without starting panel queries", async () => {
    window.localStorage.setItem(AGENT_PANEL_COLLAPSED_KEY, "1");
    const panel = await mountPanel();
    expect(
      panel.container.querySelector(
        'button[aria-label="Expand agent panel"]',
      ),
    ).not.toBeNull();
    await panel.unmount();
  });

  it("mounts the real docked coordinator in ready state", async () => {
    selectReadyRole();
    const panel = await mountPanel();
    expect(
      panel.container.querySelector(
        '[data-panel-mode="docked"][data-panel-state="ready"]',
      ),
    ).not.toBeNull();
    await panel.unmount();
  });

  it("mounts the same coordinator in the standalone surface", async () => {
    selectReadyRole();
    const panel = await mountPanel("standalone");
    expect(
      panel.container.querySelector(
        '[data-panel-mode="standalone"][data-panel-state="ready"]',
      ),
    ).not.toBeNull();
    await panel.unmount();
  });

  it("renders an unavailable role distinctly", async () => {
    selectReadyRole(unavailableRole);
    const panel = await mountPanel();
    expect(
      panel.container.querySelector('[data-panel-state="unavailable"]'),
    ).not.toBeNull();
    await panel.unmount();
  });

  it("renders blocked active work distinctly", async () => {
    selectReadyRole();
    harness.activeWork = {
      chief_engineer: [
        {
          id: "run-1",
          kind: "workflow",
          title: "Bounded proof",
          state: "blocked",
          status: "Blocked",
          currentStep: "verify",
          canonicalPath: "/workflows?run=run-1",
        },
      ],
    };
    const panel = await mountPanel();
    expect(
      panel.container.querySelector('[data-panel-state="blocked"]'),
    ).not.toBeNull();
    await panel.unmount();
  });

  it("renders provider/query failure as an error state", async () => {
    window.localStorage.setItem(AGENT_PANEL_COLLAPSED_KEY, "0");
    harness.roleError = new Error("role catalog offline");
    const panel = await mountPanel();
    expect(
      panel.container.querySelector('[data-panel-state="error"]'),
    ).not.toBeNull();
    await panel.unmount();
  });

  it("aborts an in-flight conversation when the real panel unmounts", async () => {
    selectReadyRole();
    window.localStorage.setItem(
      panelRoleStorageKey(readyRole.roleKey, "draft"),
      "hold this request",
    );
    const captured: { signal: AbortSignal | null } = { signal: null };
    harness.sendChat.mockImplementation(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          captured.signal = signal;
          signal.addEventListener(
            "abort",
            () => reject(new DOMException("Stopped", "AbortError")),
            { once: true },
          );
        }),
    );
    const panel = await mountPanel();
    const send = panel.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Send message"]',
    );
    expect(send?.disabled).toBe(false);
    await act(async () => send?.click());
    expect(captured.signal?.aborted).toBe(false);

    await panel.unmount();
    expect(captured.signal?.aborted).toBe(true);
  });
});
