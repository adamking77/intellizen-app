import {
  sendToAgentChat,
  streamHermesChat,
} from "@/services/agent";

export const HERMES_RUNTIME_CAPABILITIES = {
  structuredOutput: false,
  streaming: true,
  cancellation: true,
  timeout: true,
  usage: false,
  resume: false,
  durableRuns: true,
  modelSelect: false,
} as const;

export type HermesRoleChatInput = Parameters<typeof streamHermesChat>[0];
export type HermesInboxDispatchInput = Parameters<typeof sendToAgentChat>[0];

export function streamHermesRoleChat(input: HermesRoleChatInput) {
  return streamHermesChat(input);
}

export function dispatchHermesRoleChat(input: HermesInboxDispatchInput) {
  return sendToAgentChat(input);
}
