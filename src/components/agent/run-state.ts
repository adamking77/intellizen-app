// What a run is doing right now, derived from the thread. Shared by the
// docked panel's status line and the HUD's bar so the two surfaces can never
// disagree about whether the agent is still going.

import type { ProfileThread } from "@/engine/session-store";
import { transcriptBusy, type TurnOutcome } from "@/engine/transcript";

export type RunState =
  | { kind: "idle" }
  | { kind: "opening" }
  | { kind: "working"; label: string | null }
  | { kind: "waiting" }
  | { kind: "done"; outcome: TurnOutcome }
  | { kind: "failed"; reason: string };

export function runStateOf(thread: ProfileThread | null): RunState {
  if (!thread) return { kind: "idle" };
  const transcript = thread.transcript;
  if (thread.opening) return { kind: "opening" };
  if (transcript.pending.length > 0) return { kind: "waiting" };
  if (transcriptBusy(transcript)) return { kind: "working", label: transcript.status };
  if (transcript.lastTurn) {
    if (transcript.lastTurn.ok) return { kind: "done", outcome: transcript.lastTurn };
    const last = transcript.messages[transcript.messages.length - 1];
    return { kind: "failed", reason: last?.failed ?? "the turn failed" };
  }
  return { kind: "idle" };
}
