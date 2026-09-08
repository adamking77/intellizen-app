import { useEffect, useState } from "react";

export interface QuietNote {
  id: string;
  source: string;
  kind: "success" | "error" | "info";
  message: string;
  description?: string;
  createdAt: number;
  announced: boolean;
}

const PREFIX = "intelizen:quiet-note:";
const SEEN_PREFIX = "intelizen:quiet-note-seen:";
const CHANGED = "intelizen:quiet-notes-changed";
const fallback = new Map<string, QuietNote | null>();
const seenFallback = new Map<string, string>();
const actions = new Map<string, { label: string; onClick: () => void }>();

function revision(note: QuietNote) {
  return JSON.stringify([note.createdAt, note.kind, note.message, note.description]);
}

export function readQuietNotes(): QuietNote[] {
  const notes = new Map<string, QuietNote>();
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(PREFIX)) continue;
      try {
        const note = JSON.parse(localStorage.getItem(key) ?? "null") as QuietNote | null;
        if (note && typeof note.id === "string" && key === PREFIX + note.id && typeof note.source === "string"
          && typeof note.message === "string" && Number.isFinite(note.createdAt)
          && ["success", "error", "info"].includes(note.kind) && typeof note.announced === "boolean"
          && (note.description === undefined || typeof note.description === "string")) notes.set(note.id, note);
      } catch { /* Ignore only the malformed entry; keep the remaining updates. */ }
    }
  } catch { /* A blocked store retains new updates in this window. */ }
  for (const [id, note] of fallback) {
    if (note) notes.set(id, note);
    else notes.delete(id);
  }
  for (const [id, note] of notes) {
    let seen = seenFallback.get(id);
    try { seen ??= localStorage.getItem(SEEN_PREFIX + id) ?? undefined; } catch { /* Session-local acknowledgement. */ }
    if (seen === revision(note)) notes.set(id, { ...note, announced: true });
  }
  return [...notes.values()].sort((a, b) => b.createdAt - a.createdAt);
}

function write(note: QuietNote) {
  try {
    localStorage.setItem(PREFIX + note.id, JSON.stringify(note));
    fallback.delete(note.id);
  } catch { fallback.set(note.id, note); }
}

export function keepQuietNote(note: Omit<QuietNote, "id" | "createdAt">, action?: { label: string; onClick: () => void }) {
  const now = Date.now();
  const previous = readQuietNotes().find((item) => item.source === note.source && item.kind === note.kind && now - item.createdAt < 60_000);
  const next = { ...note, id: previous?.id ?? crypto.randomUUID(), createdAt: now };
  // One key per update prevents detached windows from replacing one shared list.
  write(next);
  if (action) actions.set(next.id, action);
  else actions.delete(next.id);
  window.dispatchEvent(new Event(CHANGED));
  return next;
}

// Callbacks remain available in their originating window, never serialized or replayed after restart.
export function quietNoteAction(id: string) { return actions.get(id); }

export function setAsideQuietNote(id: string) {
  fallback.delete(id);
  try { localStorage.removeItem(PREFIX + id); localStorage.removeItem(SEEN_PREFIX + id); }
  catch { fallback.set(id, null); }
  seenFallback.delete(id);
  actions.delete(id);
  window.dispatchEvent(new Event(CHANGED));
}

export function markQuietNotesAnnounced(notes: QuietNote[]) {
  // Acknowledgement never rewrites the message: another window may already have
  // replaced it with a newer update from the same source.
  for (const note of notes) {
    try { localStorage.setItem(SEEN_PREFIX + note.id, revision(note)); seenFallback.delete(note.id); }
    catch { seenFallback.set(note.id, revision(note)); }
  }
  window.dispatchEvent(new Event(CHANGED));
}

export function useQuietNotes() {
  const [notes, setNotes] = useState(readQuietNotes);
  useEffect(() => {
    const update = () => setNotes(readQuietNotes());
    window.addEventListener(CHANGED, update);
    window.addEventListener("storage", update);
    update();
    return () => {
      window.removeEventListener(CHANGED, update);
      window.removeEventListener("storage", update);
    };
  }, []);
  return notes;
}
