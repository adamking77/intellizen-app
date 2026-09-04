// @vitest-environment happy-dom

import { act } from "react";
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

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => document.body.replaceChildren());

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
          image="data:image/png;base64,avatar"
          defaultContext={[]}
          onSave={vi.fn().mockResolvedValue(undefined)}
          onDelete={vi.fn()}
          onPickImage={vi.fn().mockResolvedValue(undefined)}
          onClose={vi.fn()}
        />,
      );
    });

    const button = (label: string) =>
      Array.from(document.querySelectorAll("button")).find((candidate) => candidate.textContent === label);

    for (const label of ["Sphere", "Blob", "Replace picture", "Remove"]) {
      expect(button(label)?.className).toContain("pill");
    }
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
