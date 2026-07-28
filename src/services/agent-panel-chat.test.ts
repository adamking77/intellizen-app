import { describe, expect, it, vi } from "vitest";

import { sendAgentPanelChatMessage } from "@/services/agent-panel-chat";
import type { AgentPanelRoleTarget } from "@/lib/agent-panel-roles";

const role = {
  roleKey: "chief_engineer",
  roleName: "Chief Engineer",
  agentKey: "keel",
  agentName: "Keel",
  adapterId: "codex-cli",
  execution: "ephemeral",
  state: "ready",
} as AgentPanelRoleTarget;

function input(overrides: Record<string, unknown> = {}) {
  return {
    role,
    targetAgent: "keel",
    history: [],
    message: "Inspect it.",
    context: null,
    fionaSelected: false,
    fionaDirectLive: false,
    targetProfileName: null,
    signal: new AbortController().signal,
    onDelta: vi.fn(),
    voiceInputProviderId: null,
    voiceOutputProviderId: null,
    voiceProviders: [],
    ...overrides,
  };
}

function ports() {
  return {
    streamRoleRuntimeChat: vi.fn().mockResolvedValue({
      text: "Local result",
      usage: { inputTokens: 2, outputTokens: 1 },
    }),
    streamHermesChat: vi.fn().mockResolvedValue({
      text: "Hermes result",
    }),
    sendToAgentChat: vi.fn().mockResolvedValue({
      status: "queued",
      messageId: null,
      inboxItemId: "inbox-1",
    }),
  };
}

describe("agent panel chat routing", () => {
  it("routes non-Hermes roles only through their reviewed local binding", async () => {
    const adapters = ports();
    const result = await sendAgentPanelChatMessage(input(), adapters);
    expect(result).toMatchObject({
      kind: "streamed",
      provider: "local-runtime",
      text: "Local result",
    });
    expect(adapters.streamRoleRuntimeChat).toHaveBeenCalledOnce();
    expect(adapters.streamHermesChat).not.toHaveBeenCalled();
    expect(adapters.sendToAgentChat).not.toHaveBeenCalled();
  });

  it("uses direct Hermes only when Fiona's gateway is observed live", async () => {
    const adapters = ports();
    const result = await sendAgentPanelChatMessage(
      input({ fionaSelected: true, fionaDirectLive: true }),
      adapters,
    );
    expect(result).toMatchObject({
      kind: "streamed",
      provider: "hermes",
      text: "Hermes result",
    });
    expect(adapters.streamHermesChat).toHaveBeenCalledOnce();
    expect(adapters.sendToAgentChat).not.toHaveBeenCalled();
  });

  it("queues Fiona durably when direct streaming is unavailable", async () => {
    const adapters = ports();
    const result = await sendAgentPanelChatMessage(
      input({ fionaSelected: true }),
      adapters,
    );
    expect(result).toEqual({
      kind: "queued",
      provider: "hermes-inbox",
      status: "queued",
      messageId: null,
      inboxItemId: "inbox-1",
    });
    expect(adapters.sendToAgentChat).toHaveBeenCalledOnce();
    expect(adapters.streamHermesChat).not.toHaveBeenCalled();
  });
});
