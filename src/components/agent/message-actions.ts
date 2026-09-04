/** What a turn in the log can be asked to do.
 *
 *  Ported from hermes-app `messageActions.ts`, which is the **shipped** shape
 *  rather than the one `SPEC-message-actions.md` specifies: the spec's `⋯`
 *  trigger and word menu were rejected on sight and never landed. What the
 *  donor ships, and what this ports, is icons below the bubble revealed on
 *  hover — Copy and Read aloud on an agent turn, Copy and Edit on your own —
 *  with the turn's facts in the same row.
 *
 *  The derivations live here rather than in the panel so they can be tested
 *  without a DOM, and so the docked panel, the ejected panel and the HUD can
 *  never disagree about what a turn offers.
 */

import type { Message } from "@/engine/transcript";

/** Whether the user has dragged a live highlight.
 *
 *  Ported from the donor, which guards its own right-click handling with it:
 *  a person who has selected a sentence wants the system's Copy and their
 *  `⌘C`, not an app control that throws the selection away. */
export function hasTextSelection(): boolean {
  if (typeof window === "undefined") return false;
  const selection = window.getSelection();
  return Boolean(selection && !selection.isCollapsed && selection.toString().length > 0);
}

/** Whether a turn offers any actions at all.
 *
 *  Three states offer nothing, each for its own reason. **Streaming**: nothing
 *  complete to copy, nothing finished to act on. **Failed**: a failure's
 *  actions are inline and always visible, never behind a hover — see
 *  `failureActions`. **No prose**: a turn that is tools only, or a bare
 *  thought, said nothing, so there is nothing to copy or open. */
export function turnHasActions(m: Message): boolean {
  return !m.streaming && !m.failed && m.text.trim().length > 0;
}

/** The text of a turn, as the bubble renders it. */
export function turnText(m: Message): string {
  return m.text.replace(/^\s+/, "");
}

/** Every act a turn's hover row can carry. `read` and `document` are this
 *  app's additions to the donor's pair: the donor deferred reading aloud for
 *  want of an output voice, which C.10 built, and it has no document surface. */
export type MessageActionId = "copy" | "read" | "stop-reading" | "document" | "ask-again" | "edit";

export interface MessageAction {
  id: MessageActionId;
  /** The word behind the icon: its tooltip and its accessible name. */
  label: string;
  title: string;
}

export interface ActionContext {
  /** Reading replies aloud is switched on. */
  canRead: boolean;
  /** This very message is the one being spoken. */
  reading: boolean;
  /** The docs surface can take a reply. False in the HUD, which cannot route. */
  canDocument: boolean;
  /** The panel can send a turn right now: engine open, profile chosen, idle. */
  canSend: boolean;
}

/** What an agent turn offers, in the donor's order.
 *
 *  **Read aloud stays when no voice is configured** and says so instead:
 *  the donor found that hiding it made an unconfigured voice and a missing
 *  feature look identical. Entries that need something the session does not
 *  have are absent rather than greyed — a turn read back with no prompt
 *  behind it offers no *Ask again*. */
export function agentTurnActions(m: Message, ctx: ActionContext): MessageAction[] {
  if (!turnHasActions(m)) return [];
  const out: MessageAction[] = [{ id: "copy", label: "Copy this reply", title: "Copy" }];
  out.push(
    ctx.reading
      ? { id: "stop-reading", label: "Stop reading this reply", title: "Stop reading" }
      : ctx.canRead
        ? { id: "read", label: "Read this reply aloud", title: "Read aloud" }
        : { id: "read", label: "Turn on speaking in Settings", title: "Speaking is off" },
  );
  if (ctx.canDocument) {
    out.push({ id: "document", label: "Open this reply as a document", title: "Open as document" });
  }
  if (m.prompt && ctx.canSend) {
    out.push({ id: "ask-again", label: "Ask this again", title: "Ask again" });
  }
  return out;
}

/** What the person's own turn offers. No duration: a message you typed took
 *  no time to produce. */
export function userTurnActions(m: Message, ctx: ActionContext): MessageAction[] {
  if (!m.text.trim()) return [];
  const out: MessageAction[] = [{ id: "copy", label: "Copy your message", title: "Copy" }];
  if (ctx.canSend) {
    out.push({ id: "edit", label: "Edit this message and ask again", title: "Edit and ask again" });
  }
  return out;
}

/** What a failed turn offers, always visible and word-labelled. An action you
 *  must hover to discover is not offered, and the row must survive greyscale. */
export interface FailureAction {
  id: "retry" | "settings" | "copy";
  label: string;
}

export function failureActions(canRetry: boolean): FailureAction[] {
  const out: FailureAction[] = [];
  if (canRetry) out.push({ id: "retry", label: "Ask again" });
  out.push({ id: "settings", label: "Open Settings" });
  out.push({ id: "copy", label: "Copy error" });
  return out;
}

/** Everything a failure is worth pasting somewhere else. The reason alone is
 *  rarely enough to act on: which agent, through which provider, on which
 *  model is the context that makes it diagnosable. */
export function errorReport(opts: {
  reason: string;
  agent?: string | null;
  provider?: string | null;
  model?: string | null;
}): string {
  const lines = [opts.reason.trim()];
  const who = [opts.agent, opts.provider, opts.model].filter(Boolean).join(" · ");
  if (who) lines.push("", who);
  return lines.join("\n");
}
