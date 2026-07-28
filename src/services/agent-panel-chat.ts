import {
  extractGenuiBlocks,
  GENUI_SYSTEM_PROMPT,
  type AgentChatWidget,
} from "@/lib/agent-widgets";
import type { AgentPanelRoleTarget } from "@/lib/agent-panel-roles";
import type { ConversationContextSnapshot } from "@/lib/conversation-context";
import {
  sendToAgentChat,
  streamHermesChat,
  type AgentSubmission,
} from "@/services/agent";
import {
  streamRoleRuntimeChat,
  type RuntimeChatHistoryTurn,
} from "@/services/runtime-chat";

export interface AgentPanelVoiceCapability {
  id: string;
  configured: boolean;
  canTranscribe: boolean;
  canSpeak: boolean;
}

export type AgentPanelChatDelivery =
  | {
      kind: "streamed";
      provider: "local-runtime" | "hermes";
      text: string;
      widgets: AgentChatWidget[];
      usage: { inputTokens: number; outputTokens: number } | null;
    }
  | {
      kind: "queued";
      provider: "hermes-inbox";
      status: "submitted" | "queued";
      messageId: string | null;
      inboxItemId: string | null;
    };

interface AgentPanelChatPorts {
  streamRoleRuntimeChat: typeof streamRoleRuntimeChat;
  streamHermesChat: typeof streamHermesChat;
  sendToAgentChat: typeof sendToAgentChat;
}

const defaultPorts: AgentPanelChatPorts = {
  streamRoleRuntimeChat,
  streamHermesChat,
  sendToAgentChat,
};

function contextPromptBlock(context: ConversationContextSnapshot | null) {
  if (!context) return "";
  return `\n\nIntelliZen visible context (bounded; do not infer broader access):\n${JSON.stringify(
    {
      version: context.version,
      route: context.route,
      references: context.selections,
    },
    null,
    2,
  )}`;
}

function contextRouteLabel(context: ConversationContextSnapshot | null) {
  if (!context) return null;
  return `${context.route.pathname}${context.route.search}${context.route.hash}`;
}

export async function sendAgentPanelChatMessage(
  input: {
    role: AgentPanelRoleTarget;
    targetAgent: string;
    history: RuntimeChatHistoryTurn[];
    message: string;
    context: ConversationContextSnapshot | null;
    fionaSelected: boolean;
    fionaDirectLive: boolean;
    targetProfileName: string | null;
    signal: AbortSignal;
    onDelta: (text: string) => void;
    voiceInputProviderId: string | null;
    voiceOutputProviderId: string | null;
    voiceProviders: AgentPanelVoiceCapability[];
  },
  ports: AgentPanelChatPorts = defaultPorts,
): Promise<AgentPanelChatDelivery> {
  if (!input.fionaSelected) {
    const result = await ports.streamRoleRuntimeChat({
      role: input.role,
      history: input.history,
      message: input.message,
      signal: input.signal,
      onDelta: input.onDelta,
    });
    return {
      kind: "streamed",
      provider: "local-runtime",
      text: result.text,
      widgets: [],
      usage: result.usage,
    };
  }

  if (input.fionaDirectLive) {
    const result = await ports.streamHermesChat({
      message: input.message,
      history: input.history,
      systemPrompt: `${GENUI_SYSTEM_PROMPT}${contextPromptBlock(input.context)}`,
      signal: input.signal,
      onDelta: input.onDelta,
    });
    const { text, widgets } = extractGenuiBlocks(result.text);
    return {
      kind: "streamed",
      provider: "hermes",
      text,
      widgets,
      usage: null,
    };
  }

  const result: AgentSubmission = await ports.sendToAgentChat({
    message: input.message,
    targetAgent: input.targetAgent,
    profile: input.targetProfileName,
    context: {
      type: "agent_panel_chat",
      route: contextRouteLabel(input.context) ?? undefined,
      payload: {
        target_agent: input.targetAgent,
        conversation_context: input.context,
        context_references: input.context?.selections ?? [],
        voice_input_provider: input.voiceInputProviderId,
        voice_output_provider: input.voiceOutputProviderId,
        voice_providers: input.voiceProviders.map((provider) => ({
          id: provider.id,
          configured: provider.configured,
          can_transcribe: provider.canTranscribe,
          can_speak: provider.canSpeak,
        })),
        available_actions: [
          "send_message",
          "start_workflow",
          "request_approval",
          "resolve_approval",
          "add_receipt",
        ],
      },
    },
    submit: true,
  });
  return {
    kind: "queued",
    provider: "hermes-inbox",
    status: result.status === "submitted" ? "submitted" : "queued",
    messageId: result.messageId ?? null,
    inboxItemId: result.inboxItemId ?? null,
  };
}
