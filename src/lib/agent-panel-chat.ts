export interface AgentPanelChatReceipt {
  message: string;
  targetAgent: string;
  reply?: string | null;
  repliedAt?: string | null;
}

export interface AgentPanelHistoryTurn {
  role: "user" | "assistant";
  content: string;
}

export function filterAgentPanelChatReceipts<T extends AgentPanelChatReceipt>(entries: T[], query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return entries;
  return entries.filter((entry) =>
    `${entry.message}\n${entry.reply ?? ""}\n${entry.targetAgent}`.toLowerCase().includes(normalized),
  );
}

export function latestAgentPanelReplyAt(entries: AgentPanelChatReceipt[]) {
  return entries.reduce<string | null>((latest, entry) => {
    if (!entry.reply || !entry.repliedAt) return latest;
    return !latest || entry.repliedAt > latest ? entry.repliedAt : latest;
  }, null);
}

export function countUnreadAgentPanelReplies(entries: AgentPanelChatReceipt[], lastReadAt: string) {
  return entries.filter((entry) => Boolean(entry.reply) && Boolean(entry.repliedAt) && entry.repliedAt! > lastReadAt).length;
}

export function buildSteeredAgentPanelHistory(
  history: AgentPanelHistoryTurn[],
  originalMessage: string,
  partialReply: string,
  limit = 12,
) {
  return [
    ...history,
    { role: "user" as const, content: originalMessage.trim() },
    ...(partialReply.trim() ? [{ role: "assistant" as const, content: partialReply.trim() }] : []),
  ].slice(-limit);
}
