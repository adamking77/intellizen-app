// @vitest-environment happy-dom

import { act, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue({
    models: [
      { id: "test-model", name: "Test model", provider: "openai", group: "openai" },
      { id: "other-model", name: "Other model", provider: "anthropic", group: "anthropic" },
    ],
    permissionMode: null,
  }),
}));

import type { Agent } from "./agent-model";
import { AgentEditor } from "./agent-editor";
import { agentEditorDraftKey, clearAgentEditorDraft, readAgentEditorDraft, writeAgentEditorDraft } from "./agent-editor-draft";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
});

const agent: Agent = {
  id: "hermes:keel",
  name: "keel",
  displayName: "Keel",
  role: "Engineering",
  engine: "hermes",
  provider: "openai",
  model: "test-model",
  identity: "",
  context: [],
  avatarStyle: "sphere",
  hasAvatar: true,
  isDefault: false,
  description: "",
};

describe("AgentEditor avatar controls", () => {
  it("keeps the refined two-column editor and compact avatar controls", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        <AgentEditor
          agent={agent}
          creating={false}
          loadingDetail={false}
          detailError={null}
          defaultContext={[]}
          onSave={vi.fn().mockResolvedValue(undefined)}
          onDelete={vi.fn()}
          onClose={vi.fn()}
        />,
      );
    });

    const button = (label: string) =>
      Array.from(document.querySelectorAll("button")).find((candidate) => candidate.textContent === label);

    for (const label of ["Sphere", "Blob", "Trace"]) {
      expect(button(label)?.className).toContain("pill");
    }
    expect(button("Picture")).toBeUndefined();
    expect(button("Replace picture")).toBeUndefined();
    expect(button("Remove")).toBeUndefined();
    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(document.body.textContent).not.toContain("Picture override");
    expect(button("Sphere")?.className).toContain("pill-compact");
    expect(button("Sphere")?.getAttribute("aria-selected")).toBe("true");
    expect(button("Blob")?.getAttribute("aria-selected")).toBe("false");
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.className).toContain("modal-surface");
    expect(dialog?.className).toContain("max-h-[86dvh]");
    expect(dialog?.querySelector("header")?.className).toContain("sr-only");
    expect(Array.from(dialog?.querySelectorAll("h2") ?? []).some((heading) => heading.closest("header") === null && heading.textContent === "Edit agent")).toBe(true);
    expect(document.querySelector('select[title*="keeps its provider"]')).not.toBeNull();
    expect(document.querySelector('select[aria-label="Model"]')).not.toBeNull();

    await act(async () => root.unmount());
  });
});

it("saves a generated trace seed with only the existing-agent footer actions", async () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const onSave = vi.fn().mockResolvedValue(undefined);

  await act(async () => {
    root.render(
      <AgentEditor
        agent={agent}
        creating={false}
        loadingDetail={false}
        detailError={null}
        defaultContext={[]}
        onSave={onSave}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );
  });

  const button = (label: string) => Array.from(document.querySelectorAll("button")).find((candidate) => candidate.textContent === label)!;
  await act(async () => button("Trace").click());
  expect(button("Generate another")).toBeTruthy();
  await act(async () => button("Generate another").click());
  expect(Array.from(document.querySelector('[aria-label="Agent actions"]')!.querySelectorAll("button")).map((item) => item.textContent)).toEqual(["Delete", "Cancel", "Save"]);
  await act(async () => button("Save").click());

  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ avatarStyle: "trace", avatarSeed: expect.any(Number) }), false);
  await act(async () => root.unmount());
});

function editorProps(overrides: Partial<ComponentProps<typeof AgentEditor>> = {}) {
  return {
    agent,
    creating: false,
    loadingDetail: false,
    detailError: null,
    defaultContext: [],
    onSave: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  } satisfies ComponentProps<typeof AgentEditor>;
}

function replaceValue(node: Element, value: string) {
  if (!(node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement)) throw new Error("Expected an editor field");
  const prototype = node instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(node, value);
  node.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("AgentEditor draft recovery", () => {
  it("restores edits after close and restart", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    let root = createRoot(host);
    await act(async () => root.render(<AgentEditor {...editorProps()} />));
    await act(async () => {
      replaceValue(document.querySelector('[aria-label="Role"]')!, "System design");
      replaceValue(document.querySelector('[aria-label="Identity"]')!, "Draft identity");
    });
    await act(async () => root.unmount());

    root = createRoot(host);
    const detailed = { ...agent, identity: "Fresh saved identity", provider: "anthropic", model: "other-model" };
    await act(async () => root.render(<AgentEditor {...editorProps({ agent: detailed })} />));
    expect((document.querySelector('[aria-label="Role"]') as HTMLInputElement).value).toBe("System design");
    expect((document.querySelector('[aria-label="Identity"]') as HTMLTextAreaElement).value).toBe("Draft identity");
    expect((document.querySelector('[aria-label="Model"]') as HTMLSelectElement).value).toBe('["anthropic","other-model"]');
    await act(async () => root.unmount());
  });

  it("uses only Save and Cancel for a new agent", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const fresh = { ...agent, id: "hermes:new", name: "", displayName: "" };
    await act(async () => root.render(<AgentEditor {...editorProps({ agent: fresh, creating: true })} />));
    expect(Array.from(document.querySelector('[aria-label="Agent actions"]')!.querySelectorAll("button")).map((item) => item.textContent)).toEqual(["Cancel", "Save"]);
    expect((document.querySelector('[aria-label="Agent actions"] button:last-child') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => root.unmount());
  });

  it("does not let a late detail response overwrite a field edited in the open form", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(<AgentEditor {...editorProps()} />));
    await act(async () => replaceValue(document.querySelector('[aria-label="Identity"]')!, "Keep my edit"));
    await act(async () => root.render(<AgentEditor {...editorProps({ agent: { ...agent, identity: "Late server detail" } })} />));
    expect((document.querySelector('[aria-label="Identity"]') as HTMLTextAreaElement).value).toBe("Keep my edit");
    await act(async () => root.unmount());
  });

  it("persists late detail fields after a name edit without treating them as user edits", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    let root = createRoot(host);
    const acp = { ...agent, id: "acp:keel", engine: "codex" as const, identity: "", provider: "", model: "" };
    await act(async () => root.render(<AgentEditor {...editorProps({ agent: acp, loadingDetail: true })} />));
    await act(async () => replaceValue(document.querySelector('[aria-label="Agent name"]')!, "Renamed before details"));
    const detailed = { ...acp, identity: "Saved identity", provider: "openai", model: "test-model" };
    await act(async () => root.render(<AgentEditor {...editorProps({ agent: detailed, loadingDetail: false })} />));
    await act(async () => root.unmount());

    root = createRoot(host);
    await act(async () => root.render(<AgentEditor {...editorProps({ agent: detailed })} />));
    expect((document.querySelector('[aria-label="Agent name"]') as HTMLInputElement).value).toBe("Renamed before details");
    expect((document.querySelector('[aria-label="Identity"]') as HTMLTextAreaElement).value).toBe("Saved identity");
    expect((document.querySelector('[aria-label="Model"]') as HTMLSelectElement).value).toBe('["openai","test-model"]');
    await act(async () => root.unmount());
  });

  it("rejects an existing-agent draft stored under the wrong identity", async () => {
    const other = { ...agent, id: "hermes:other", name: "other", displayName: "Other", role: "Fresh role" };
    localStorage.setItem(agentEditorDraftKey(other.id, false), JSON.stringify({ version: 1, draft: { ...agent, role: "Wrong agent draft" }, touched: ["role"] }));
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(<AgentEditor {...editorProps({ agent: other })} />));
    expect((document.querySelector('[aria-label="Role"]') as HTMLInputElement).value).toBe("Fresh role");
    await act(async () => root.unmount());
  });

  it("retains a failed save and clears only after a successful save", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    let root = createRoot(host);
    const failedSave = vi.fn().mockRejectedValue(new Error("Provider unavailable"));
    await act(async () => root.render(<AgentEditor {...editorProps({ onSave: failedSave })} />));
    await act(async () => replaceValue(document.querySelector('[aria-label="Role"]')!, "Retained after failure"));
    await act(async () => Array.from(document.querySelectorAll("button")).find((button) => button.textContent === "Save")!.click());
    expect(document.body.textContent).toContain("Provider unavailable");
    await act(async () => root.unmount());

    root = createRoot(host);
    const saved = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    await act(async () => root.render(<AgentEditor {...editorProps({ onSave: saved, onClose })} />));
    expect((document.querySelector('[aria-label="Role"]') as HTMLInputElement).value).toBe("Retained after failure");
    await act(async () => Array.from(document.querySelectorAll("button")).find((button) => button.textContent === "Save")!.click());
    expect(saved).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    await act(async () => root.unmount());

    root = createRoot(host);
    await act(async () => root.render(<AgentEditor {...editorProps()} />));
    expect((document.querySelector('[aria-label="Role"]') as HTMLInputElement).value).toBe("Engineering");
    await act(async () => root.unmount());
  });

  it("uses one stable recovery scope for a new agent", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    let root = createRoot(host);
    const first = { ...agent, id: "acp:first", engine: "codex" as const, name: "", displayName: "" };
    await act(async () => root.render(<AgentEditor {...editorProps({ agent: first, creating: true })} />));
    await act(async () => replaceValue(document.querySelector('[aria-label="Agent name"]')!, "Recovered new agent"));
    await act(async () => root.unmount());

    root = createRoot(host);
    const next = { ...first, id: "acp:second" };
    await act(async () => root.render(<AgentEditor {...editorProps({ agent: next, creating: true })} />));
    expect((document.querySelector('[aria-label="Agent name"]') as HTMLInputElement).value).toBe("Recovered new agent");
    await act(async () => root.unmount());
  });
});

it("does not restore a cleared draft in this window when storage removal fails", () => {
  writeAgentEditorDraft(agent.id, false, agent, ["displayName"]);
  const remove = vi.spyOn(localStorage, "removeItem").mockImplementation(() => { throw new Error("blocked"); });
  try {
    clearAgentEditorDraft(agent.id, false);
    expect(readAgentEditorDraft(agent.id, false)).toBeNull();
  } finally { remove.mockRestore(); }
});
