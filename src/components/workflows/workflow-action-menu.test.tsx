// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { WorkflowActionMenu } from "./workflow-action-menu";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("discloses secondary actions with keyboard focus, disabled guards and focus return", async () => {
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host); const source = vi.fn(); const activate = vi.fn();
  try {
    await act(async () => root.render(<WorkflowActionMenu label="Workflow actions" actions={[
      { label: "Activate", disabled: true, onSelect: activate },
      { label: "Source", onSelect: source },
      { label: "Schedule", onSelect: () => {} },
    ]} />));
    const trigger = host.querySelector("button")!;
    expect(document.querySelector('[role="menu"]')).toBeNull();
    await act(async () => trigger.click());
    expect(document.activeElement?.textContent).toBe("Source");
    await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
    expect(document.activeElement?.textContent).toBe("Schedule");
    await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(document.querySelector('[role="menu"]')).toBeNull(); expect(document.activeElement).toBe(trigger);
    await act(async () => trigger.click());
    await act(async () => (document.activeElement as HTMLButtonElement).click());
    expect(source).toHaveBeenCalledOnce(); expect(activate).not.toHaveBeenCalled();
    expect(document.querySelector('[role="menu"]')).toBeNull(); expect(document.activeElement).toBe(trigger);
  } finally { await act(async () => root.unmount()); host.remove(); }
});
