export interface DocumentSaveSnapshot {
  text: string;
  status: "idle" | "dirty" | "saving" | "saved" | "error";
  error: string | null;
}

/** One document, one ordered writer. Navigating away flushes rather than cancels. */
export class DocumentSaveSession {
  private saved: string;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private writing: Promise<void> | null = null;
  private listeners = new Set<() => void>();
  private snapshot: DocumentSaveSnapshot;
  constructor(private options: {
    initial: string;
    save: (text: string) => Promise<void>;
    storeDraft: (text: string | null) => void;
    recovered?: string | null;
  }) {
    this.saved = options.initial;
    const text = options.recovered ?? options.initial;
    this.snapshot = { text, status: text === this.saved ? "idle" : "dirty", error: null };
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(patch: Partial<DocumentSaveSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  adopt(text: string) {
    if (!["idle", "saved"].includes(this.snapshot.status) || this.writing || text === this.snapshot.text) return;
    this.saved = text;
    this.publish({ text, status: "idle", error: null });
  }
  edit(text: string) {
    if (text === this.snapshot.text) return;
    this.options.storeDraft(text);
    this.publish({ text, status: "dirty", error: null });
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.flush(); }, 800);
  }
  flush = (): Promise<void> => {
    clearTimeout(this.timer);
    if (this.writing) return this.writing;
    if (this.snapshot.text === this.saved) {
      this.options.storeDraft(null);
      this.publish({ status: "saved", error: null });
      return Promise.resolve();
    }
    this.writing = (async () => {
      while (this.saved !== this.snapshot.text) {
        const text = this.snapshot.text;
        this.publish({ status: "saving", error: null });
        try {
          await this.options.save(text);
          this.saved = text;
          if (this.snapshot.text === text) this.options.storeDraft(null);
        } catch (error) {
          this.publish({ status: "error", error: error instanceof Error ? error.message : String(error) });
          return;
        }
      }
      this.publish({ status: "saved" });
    })().finally(() => { this.writing = null; });
    return this.writing;
  };
}

// A quick return to a document shares its pending writer, including failure state.
export const documentSaveSessions = new Map<string, DocumentSaveSession>();
