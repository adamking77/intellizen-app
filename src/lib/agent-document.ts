function compactPlainText(value: string) {
  return value
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[`*_>#~-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function summarize(value: string, maxLength = 64) {
  const plain = compactPlainText(value);
  if (plain.length <= maxLength) return plain;
  return `${plain.slice(0, maxLength - 1).trimEnd()}…`;
}

export function buildAgentReplyDocumentDraft(input: {
  request: string;
  reply: string;
  agentName?: string;
  ventureLabel: string;
  routeLabel?: string | null;
  occurredAt?: Date;
}) {
  const agentName = input.agentName?.trim() || "Fiona";
  const occurredAt = input.occurredAt ?? new Date();
  const requestSummary = summarize(input.request) || "Agent reply";
  const title = `${agentName} — ${requestSummary}`;
  const savedAt = new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(occurredAt);
  const context = [
    `Saved from Agent Panel on ${savedAt}`,
    `Venture: ${input.ventureLabel}`,
    input.routeLabel ? `Route: ${input.routeLabel}` : "",
  ].filter(Boolean).join(" · ");

  return {
    title,
    body: `# ${title}\n\n> ${context}\n\n## Request\n\n${input.request.trim()}\n\n## ${agentName}’s reply\n\n${input.reply.trim()}\n`,
  };
}
