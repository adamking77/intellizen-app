import { toast as sonner } from "sonner";
import { readSessionMode } from "./session-mode";
import { keepQuietNote, markQuietNotesAnnounced, readQuietNotes } from "./quiet-notes";

type ToastOpts = {
  description?: string;
  action?: { label: string; onClick: () => void };
  source?: string;
  origin?: "user" | "background";
};

export function noteDuration(message: string) {
  return Math.min(12_000, Math.max(6_000, message.trim().split(/\s+/).length * 240));
}

function present(kind: "success" | "error" | "info", message: string, opts?: ToastOpts) {
  const mode = readSessionMode();
  const held = mode === null || mode === "not_today" || mode === "thinking" || (mode === "executing" && opts?.origin === "background");
  const source = opts?.source ?? message;
  if (held || kind === "error") keepQuietNote({ kind, message, source, description: opts?.description, announced: !held }, opts?.action);
  if (held) return;
  const { source: _source, origin: _origin, ...options } = opts ?? {};
  const show = kind === "info" ? sonner.message : sonner[kind];
  return show(message, { ...options, id: `note:${source}`, duration: noteDuration(`${message} ${opts?.description ?? ""}`) });
}

export const toast = {
  success: (message: string, opts?: ToastOpts) => present("success", message, opts),
  error: (message: string, opts?: ToastOpts) => present("error", message, opts),
  info: (message: string, opts?: ToastOpts) => present("info", message, opts),
};

export function syncQuietToasts() {
  const mode = readSessionMode();
  if (mode === null || mode === "not_today" || mode === "thinking") { sonner.dismiss(); return; }
  const notes = readQuietNotes().filter((note) => !note.announced);
  if (!notes.length) return;
  sonner.message(`${notes.length} ${notes.length === 1 ? "update saved" : "updates saved"}. Review on Home.`, { id: "quiet-return", duration: 6000 });
  markQuietNotesAnnounced(notes);
}

export function dismissToasts() {
  sonner.dismiss();
}

export function errorMessage(err: unknown) {
  if (err instanceof Error) return err.message;
  if (typeof err !== "object" || err === null) {
    const text = String(err);
    return text === "[object Object]"
      ? "Request failed without diagnostic detail."
      : text;
  }
  const record = err as Record<string, unknown>;
  const message =
    typeof record.message === "string" ? record.message.trim() : "";
  const code = typeof record.code === "string" ? record.code.trim() : "";
  if (message) return code && code !== message ? `${message} · ${code}` : message;
  const details = ["details", "hint"].flatMap((key) => {
    const value = record[key];
    return typeof value === "string" && value.trim()
      ? [value.trim().split("\n")[0]]
      : [];
  });
  if (details.length) return [...new Set(details)].join(" · ");
  try {
    return JSON.stringify(record);
  } catch {
    return "Unknown error";
  }
}

export function toastError(prefix: string, err: unknown, opts?: Pick<ToastOpts, "source" | "origin">) {
  toast.error(prefix, { ...opts, description: errorMessage(err) });
}
