// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearPanelDraft, PANEL_DRAFT_PREFIX, panelDraftMatches, readPanelDraft, usePanelDraft, writePanelDraft } from "./panel-draft";

const mounts: { root: Root; element: HTMLDivElement }[] = [];

afterEach(async () => {
  for (const { root, element } of mounts.splice(0)) {
    await act(async () => root.unmount());
    element.remove();
  }
  vi.restoreAllMocks();
  window.localStorage.clear();
  window.dispatchEvent(new StorageEvent("storage", { key: null }));
});

async function mount(profile: string) {
  const element = document.createElement("div");
  document.body.append(element);
  const root = createRoot(element);
  mounts.push({ root, element });
  let state: ReturnType<typeof usePanelDraft>;
  function Harness({ target }: { target: string }) {
    state = usePanelDraft(target);
    return <p>{state.draft} {state.attachments.map((file) => file.name).join(", ")}</p>;
  }
  async function target(next: string) {
    await act(async () => root.render(<Harness target={next} />));
  }
  await target(profile);
  return { target, element, get state() { return state!; } };
}

describe("panel draft continuity", () => {
  it("keeps independent engine/profile drafts and attachments across target changes and unmounts", async () => {
    const panel = await mount("keel");
    await act(async () => {
      panel.state.setDraft("Review the plan");
      panel.state.setAttachments([{ path: "/tmp/plan.md", name: "plan.md" }]);
    });
    await panel.target("acp:keel");
    expect(panel.state.draft).toBe("");
    await act(async () => panel.state.setDraft("Check the code"));
    await panel.target("keel");
    expect(panel.state.draft).toBe("Review the plan");
    expect(panel.state.attachments).toEqual([{ path: "/tmp/plan.md", name: "plan.md" }]);
    const mounted = mounts.shift()!;
    await act(async () => mounted.root.unmount());
    mounted.element.remove();
    const reopened = await mount("keel");
    expect(reopened.element.textContent).toBe("Review the plan plan.md");
    await reopened.target("acp:keel");
    expect(reopened.state.draft).toBe("Check the code");
  });

  it("synchronizes same-window consumers and cross-window storage updates without overwriting another target", async () => {
    const docked = await mount("fiona");
    const mirror = await mount("fiona");
    await act(async () => docked.state.setDraft("Keep this thought"));
    expect(mirror.state.draft).toBe("Keep this thought");
    const key = `${PANEL_DRAFT_PREFIX}fiona`;
    const raw = JSON.stringify({ text: "Edited in ejected window", attachments: [{ path: "/tmp/notes.md", name: "notes.md" }], revision: "remote-1" });
    await act(async () => {
      window.localStorage.setItem(key, raw);
      window.dispatchEvent(new StorageEvent("storage", { key, newValue: raw }));
    });
    expect(docked.state.draft).toBe("Edited in ejected window");
    expect(mirror.state.attachments[0]?.name).toBe("notes.md");
    expect(readPanelDraft("acp:fiona").text).toBe("");
  });

  it("clears only the accepted send's unchanged revision and preserves edits made while sending", () => {
    const attachment = { path: "/tmp/one.md", name: "one.md" };
    writePanelDraft("keel", { text: "  Review this  ", attachments: [attachment] });
    const submitted = readPanelDraft("keel");
    expect(panelDraftMatches(submitted, "Review this", [attachment])).toBe(true);
    expect(panelDraftMatches(submitted, "Review this", [])).toBe(false);
    writePanelDraft("keel", { text: "Next question", attachments: [] });
    clearPanelDraft("keel", submitted);
    expect(readPanelDraft("keel").text).toBe("Next question");
    clearPanelDraft("keel", readPanelDraft("keel"));
    expect(readPanelDraft("keel").text).toBe("");
  });

  it("retains a draft in memory when local storage rejects writes", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    const panel = await mount("local-only");
    await act(async () => panel.state.setDraft("Still recoverable this session"));
    await panel.target("other");
    await panel.target("local-only");
    expect(panel.state.draft).toBe("Still recoverable this session");
  });

  it("ignores malformed recovery entries", () => {
    const key = `${PANEL_DRAFT_PREFIX}broken`;
    window.localStorage.setItem(key, "{invalid");
    expect(readPanelDraft("broken").text).toBe("");
    window.localStorage.setItem(key, JSON.stringify({ text: "bad", revision: "1", attachments: [null] }));
    expect(readPanelDraft("broken").attachments).toEqual([]);
  });
});
