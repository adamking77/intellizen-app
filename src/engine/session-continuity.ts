// Durable pointer to Hermes-owned panel history. IntelliZen stores no copy of
// the transcript: only enough identity and display metadata to ask Hermes for it.

import type { SessionHistoryMessage, SessionUsage } from "./contract";
import { createTranscript, type Message, type TranscriptState } from "./transcript";

const KEY_PREFIX = "intelizen:panel-session:v1:";

export interface SessionPointer {
  runtimeSessionId: string;
  storedSessionId: string;
  usage: SessionUsage | null;
  approvalMode: TranscriptState["approvalMode"];
}

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function key(profile: string) {
  return `${KEY_PREFIX}${encodeURIComponent(profile)}`;
}

export function readSessionPointer(profile: string): SessionPointer | null {
  try {
    const parsed = JSON.parse(storage()?.getItem(key(profile)) ?? "null") as Partial<SessionPointer> | null;
    if (
      !parsed ||
      typeof parsed.runtimeSessionId !== "string" ||
      !parsed.runtimeSessionId ||
      typeof parsed.storedSessionId !== "string" ||
      !parsed.storedSessionId
    ) {
      return null;
    }
    return {
      runtimeSessionId: parsed.runtimeSessionId,
      storedSessionId: parsed.storedSessionId,
      usage: parsed.usage && typeof parsed.usage === "object" ? parsed.usage : null,
      approvalMode:
        parsed.approvalMode === "manual" || parsed.approvalMode === "smart" || parsed.approvalMode === "off"
          ? parsed.approvalMode
          : null,
    };
  } catch {
    return null;
  }
}

export function writeSessionPointer(profile: string, pointer: SessionPointer) {
  try {
    storage()?.setItem(key(profile), JSON.stringify(pointer));
  } catch {
    // Continuity is best-effort; the live session still works without storage.
  }
}

export function clearSessionPointer(profile: string) {
  try {
    storage()?.removeItem(key(profile));
  } catch {
    // Nothing else owns this optional pointer.
  }
}

function reasoningText(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value;
  if (Array.isArray(value)) {
    const joined = value.map(reasoningText).filter(Boolean).join("\n");
    return joined || undefined;
  }
  if (value && typeof value === "object") {
    const row = value as Record<string, unknown>;
    return reasoningText(row.text ?? row.content);
  }
  return undefined;
}

function at(message: SessionHistoryMessage): number | undefined {
  return typeof message.timestamp === "number" && message.timestamp > 0
    ? Math.round(message.timestamp * 1000)
    : undefined;
}

/** Project Hermes's display-safe history response into the panel's compact
 * transcript model. Tool rows belong to the assistant bubble before them. */
export function transcriptFromHistory(
  agent: string,
  history: SessionHistoryMessage[],
  saved?: Pick<SessionPointer, "usage" | "approvalMode">,
): TranscriptState {
  const messages: Message[] = [];
  let seq = 0;
  for (const row of history) {
    if (row.role === "tool") {
      let owner = [...messages].reverse().find((message) => message.from !== "you");
      if (!owner) {
        owner = { id: `t${++seq}`, from: agent, text: "" };
        messages.push(owner);
      }
      const name = typeof row.name === "string" && row.name ? row.name : "tool";
      owner.tools = [
        ...(owner.tools ?? []),
        {
          id: `${owner.id}-tool-${(owner.tools?.length ?? 0) + 1}`,
          name,
          title: typeof row.context === "string" && row.context ? row.context : name,
          ok: true,
        },
      ];
      continue;
    }
    if (row.role !== "user" && row.role !== "assistant" && row.role !== "system") continue;
    const text = typeof row.text === "string" ? row.text : "";
    const thought = reasoningText(row.reasoning ?? row.reasoning_content);
    if (!text.trim() && !thought) continue;
    const timestamp = at(row);
    messages.push({
      id: `t${++seq}`,
      from: row.role === "user" ? "you" : agent,
      text,
      ...(thought ? { thought } : {}),
      ...(timestamp === undefined ? {} : { at: timestamp }),
    });
  }
  return {
    ...createTranscript(agent),
    messages,
    seq,
    usage: saved?.usage ?? null,
    approvalMode: saved?.approvalMode ?? null,
  };
}
