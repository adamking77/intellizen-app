import { useCallback, useMemo, useSyncExternalStore, type SetStateAction } from "react";
import type { SessionAttachment } from "@/engine/session";

export const PANEL_DRAFT_PREFIX = "intelizen:panel-draft:";
const CHANGE_EVENT = "intelizen:panel-draft-changed";

export interface PanelDraft {
  text: string;
  attachments: SessionAttachment[];
  revision: string;
}

const EMPTY: PanelDraft = { text: "", attachments: [], revision: "" };
// Quota/private-mode failures must still survive a component unmount.
const fallback = new Map<string, string>();
const keyFor = (profile: string) => `${PANEL_DRAFT_PREFIX}${encodeURIComponent(profile)}`;

function readRaw(profile: string | null): string | null {
  if (!profile || typeof window === "undefined") return null;
  const key = keyFor(profile);
  if (fallback.has(key)) return fallback.get(key)!;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function parse(raw: string | null): PanelDraft {
  if (!raw) return EMPTY;
  try {
    const value = JSON.parse(raw) as Partial<PanelDraft>;
    if (typeof value.text !== "string" || typeof value.revision !== "string" || !Array.isArray(value.attachments)) return EMPTY;
    if (!value.attachments.every((item) => item && typeof item.path === "string" && typeof item.name === "string")) return EMPTY;
    return value as PanelDraft;
  } catch {
    return EMPTY;
  }
}

export function readPanelDraft(profile: string | null): PanelDraft {
  return parse(readRaw(profile));
}

export function writePanelDraft(profile: string, draft: Pick<PanelDraft, "text" | "attachments">): void {
  const key = keyFor(profile);
  const raw = JSON.stringify({ ...draft, revision: crypto.randomUUID() });
  try {
    window.localStorage.setItem(key, raw);
    fallback.delete(key);
  } catch {
    fallback.set(key, raw);
  }
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: key }));
}

/** Called only after the engine accepts the send, in the main window. A
 * newer draft written while that request was pending belongs to the user. */
export function clearPanelDraft(profile: string, expected: PanelDraft): void {
  if (!expected.revision || readPanelDraft(profile).revision !== expected.revision) return;
  writePanelDraft(profile, EMPTY);
}

export function panelDraftMatches(draft: PanelDraft, text: string, attachments: SessionAttachment[]): boolean {
  return draft.text.trim() === text.trim()
    && draft.attachments.length === attachments.length
    && draft.attachments.every((item, index) => item.path === attachments[index].path && item.name === attachments[index].name);
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && !event.key.startsWith(PANEL_DRAFT_PREFIX)) return;
    if (event.key === null) fallback.clear();
    else fallback.delete(event.key);
    onChange();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** One draft per engine/profile identity, shared by docked and ejected UI.
 * Storage holds only the text and attachment references, never file bodies. */
export function usePanelDraft(profile: string | null) {
  const raw = useSyncExternalStore(subscribe, () => readRaw(profile), () => null);
  const draft = useMemo(() => parse(raw), [raw]);
  const setDraft = useCallback((value: SetStateAction<string>) => {
    if (!profile) return;
    const current = readPanelDraft(profile);
    writePanelDraft(profile, { ...current, text: typeof value === "function" ? value(current.text) : value });
  }, [profile]);
  const setAttachments = useCallback((value: SetStateAction<SessionAttachment[]>) => {
    if (!profile) return;
    const current = readPanelDraft(profile);
    writePanelDraft(profile, { ...current, attachments: typeof value === "function" ? value(current.attachments) : value });
  }, [profile]);
  return { draft: draft.text, attachments: draft.attachments, setDraft, setAttachments };
}
