import { serializeCanvasDocument } from "@/components/canvas/CanvasSerializer";
import type { CanvasDocumentData } from "./types";
import { DocumentSaveSession } from "./document-save-session";

export const CANVAS_DRAFT_PREFIX = "intelizen:canvas-draft:";
export const canvasSaveSessions = new Map<number, DocumentSaveSession>();

export function canvasSaveText(document: CanvasDocumentData): string {
  return JSON.stringify(serializeCanvasDocument(document));
}

function recoveredCanvas(id: number): string | null {
  try {
    const raw = window.localStorage.getItem(`${CANVAS_DRAFT_PREFIX}${id}`);
    if (!raw) return null;
    const value = JSON.parse(raw) as CanvasDocumentData;
    if (!value || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) return null;
    return canvasSaveText(value);
  } catch {
    return null;
  }
}

/** Reuse the document writer: each canvas has one ordered save and a local
 * recovery copy. The writer outlives the route/editor that started it. */
export function getCanvasSaveSession(
  id: number,
  initial: CanvasDocumentData,
  save: (document: CanvasDocumentData) => Promise<void>,
): DocumentSaveSession {
  const existing = canvasSaveSessions.get(id);
  if (existing) return existing;
  const session = new DocumentSaveSession({
    initial: canvasSaveText(initial),
    recovered: recoveredCanvas(id),
    save: (text) => save(JSON.parse(text) as CanvasDocumentData),
    storeDraft: (text) => {
      try {
        if (text == null) window.localStorage.removeItem(`${CANVAS_DRAFT_PREFIX}${id}`);
        else window.localStorage.setItem(`${CANVAS_DRAFT_PREFIX}${id}`, text);
      } catch {
        // The shared writer still retains this session's pending content.
      }
    },
  });
  canvasSaveSessions.set(id, session);
  return session;
}
