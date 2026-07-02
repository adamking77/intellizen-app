// Pure text helpers for the agent-work body-section format.
// These functions define the append/parse contract shared by the app and the
// MCP server until receipts move fully onto workspace.work_events.

export function formatAgentWorkTimestamp(date = new Date()) {
  return date.toISOString().replace("T", " ").slice(0, 16);
}

export function appendMarkdownSection(body: string | null | undefined, section: string) {
  const trimmedBody = (body ?? "").trimEnd();
  return trimmedBody ? `${trimmedBody}\n\n${section}` : section;
}

export function markdownList(items?: string[]) {
  if (!items?.length) return "none";
  return items.map((item) => `- ${item}`).join("\n");
}

export function latestBodyField(body: string | null | undefined, labels: string[]) {
  const source = body ?? "";
  let latest: string | null = null;
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matches = source.matchAll(new RegExp(`^${escaped}:\\s*(.+)$`, "gim"));
    for (const match of matches) {
      const value = match[1]?.trim();
      if (value && value !== "none") latest = value;
    }
  }
  return latest;
}

export function latestMarkdownSection(body: string | null | undefined, headings: string[]) {
  const source = (body ?? "").trim();
  if (!source) return null;
  const sections = source.split(/\n(?=##\s+)/g);
  for (let index = sections.length - 1; index >= 0; index -= 1) {
    const section = sections[index]?.trim();
    if (!section) continue;
    const firstLine = section.split("\n", 1)[0]?.replace(/^##\s*/, "") ?? "";
    if (headings.some((heading) => firstLine.startsWith(heading))) {
      return section.slice(0, 900);
    }
  }
  return null;
}
