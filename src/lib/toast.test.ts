// @vitest-environment happy-dom
import { beforeEach, expect, it, vi } from "vitest";

const sonner = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), message: vi.fn(), dismiss: vi.fn() }));
vi.mock("sonner", () => ({ toast: sonner }));

import { dismissToasts, noteDuration, syncQuietToasts, toast, toastError } from "./toast";
import { markQuietNotesAnnounced, quietNoteAction, readQuietNotes, setAsideQuietNote } from "./quiet-notes";
import { initializeSessionMode, resetSessionModeForTests, setSessionMode } from "./session-mode";

beforeEach(async () => {
  vi.clearAllMocks();
  localStorage.clear();
  resetSessionModeForTests();
  await initializeSessionMode(async () => "launch-1");
});

it("keeps every quiet notification for later instead of losing it", () => {
  setSessionMode("not_today");
  toast.success("Saved");
  toast.info("Changed");
  toast.error("Failed");
  toastError("Failed", new Error("detail"));
  expect(sonner.success).not.toHaveBeenCalled();
  expect(sonner.message).not.toHaveBeenCalled();
  expect(sonner.error).not.toHaveBeenCalled();
  expect(readQuietNotes()).toHaveLength(3);
  expect(readQuietNotes().find((note) => note.kind === "error")?.description).toBe("detail");
});

it("holds Thinking updates and presents one summary on leaving it", () => {
  setSessionMode("thinking");
  toast.success("Saved");
  toast.info("Changed");
  toast.error("Failed");
  toastError("Detailed", new Error("detail"));
  expect(sonner.success).not.toHaveBeenCalled();
  expect(sonner.error).not.toHaveBeenCalled();
  setSessionMode("deciding");
  syncQuietToasts();
  expect(sonner.message).toHaveBeenCalledWith("4 updates saved. Review on Home.", expect.objectContaining({ id: "quiet-return" }));
  syncQuietToasts();
  expect(sonner.message).toHaveBeenCalledTimes(1);
  expect(readQuietNotes()).toHaveLength(4);
});

it("retains failures through a new launch until explicitly set aside", async () => {
  setSessionMode("not_today");
  toastError("Could not save", new Error("Connection closed"));
  resetSessionModeForTests();
  await initializeSessionMode(async () => "launch-2");
  expect(readQuietNotes()[0]).toMatchObject({ message: "Could not save", description: "Connection closed", announced: false });
  setAsideQuietNote(readQuietNotes()[0].id);
  expect(readQuietNotes()).toEqual([]);
});

it("shows own action results in Executing, holding background updates", () => {
  setSessionMode("executing");
  toast.success("Saved");
  toast.info("Import finished", { origin: "background" });
  toastError("Could not save", new Error("Try again"));
  expect(sonner.success).toHaveBeenCalledWith("Saved", expect.objectContaining({ duration: 6000 }));
  expect(sonner.message).not.toHaveBeenCalled();
  expect(sonner.error).toHaveBeenCalledTimes(1);
  expect(readQuietNotes()).toHaveLength(2);
});

it("coalesces one source within a minute, retains different sources, and ignores malformed entries", () => {
  setSessionMode("thinking");
  toast.info("One record imported", { source: "import" });
  toast.info("Ten records imported", { source: "import" });
  toast.info("File saved", { source: "document" });
  localStorage.setItem("intelizen:quiet-note:broken", "{");
  expect(readQuietNotes().map((note) => note.message)).toEqual(expect.arrayContaining(["Ten records imported", "File saved"]));
  expect(readQuietNotes()).toHaveLength(2);
});

it("uses a readable bounded duration", () => {
  expect(noteDuration("Saved")).toBe(6000);
  expect(noteDuration("word ".repeat(30))).toBe(7200);
  expect(noteDuration("word ".repeat(100))).toBe(12000);
});

it("does not overwrite a newer window's update when acknowledging an older summary", () => {
  setSessionMode("thinking");
  toast.info("One imported", { source: "import" });
  const old = readQuietNotes();
  toast.info("Two imported", { source: "import" });
  markQuietNotesAnnounced(old);
  expect(readQuietNotes()[0]).toMatchObject({ message: "Two imported", announced: false });
});

it("keeps a held Undo action available in its originating window", () => {
  setSessionMode("thinking");
  const undo = vi.fn();
  toast.success("View removed", { action: { label: "Undo", onClick: undo } });
  const note = readQuietNotes()[0];
  quietNoteAction(note.id)?.onClick();
  expect(undo).toHaveBeenCalledOnce();
  setAsideQuietNote(note.id);
  expect(quietNoteAction(note.id)).toBeUndefined();
});

it("can clear queued notifications when Not today becomes active", () => {
  dismissToasts();
  expect(sonner.dismiss).toHaveBeenCalledOnce();
});

it("keeps a reviewed update hidden in this window if storage removal fails", () => {
  setSessionMode("thinking");
  toast.info("Storage test", { source: "storage-removal" });
  const note = readQuietNotes()[0];
  const remove = vi.spyOn(localStorage, "removeItem").mockImplementation(() => { throw new Error("blocked"); });
  try {
    setAsideQuietNote(note.id);
    expect(readQuietNotes().some((item) => item.id === note.id)).toBe(false);
  } finally { remove.mockRestore(); }
});
