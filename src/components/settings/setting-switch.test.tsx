// @vitest-environment happy-dom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SettingSwitch } from "./setting-switch";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => document.body.replaceChildren());

describe("SettingSwitch", () => {
  it("uses the Hermes accent indicator treatment when enabled", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(<SettingSwitch on label="Reconnect" onToggle={vi.fn()} />));

    const control = host.querySelector<HTMLButtonElement>('[role="switch"]')!;
    expect(control.className).toContain("var(--accent)_55%");
    expect(control.firstElementChild?.className).toContain("bg-[var(--accent)]");
    expect(control.getAttribute("aria-checked")).toBe("true");

    await act(async () => root.unmount());
  });

  it("uses the Hermes neutral indicator treatment when disabled", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(<SettingSwitch on={false} label="Reconnect" onToggle={vi.fn()} />));

    const control = host.querySelector<HTMLButtonElement>('[role="switch"]')!;
    expect(control.className).toContain("var(--text)_14%");
    expect(control.firstElementChild?.className).toContain("bg-[var(--text-muted)]");
    expect(control.getAttribute("aria-checked")).toBe("false");

    await act(async () => root.unmount());
  });
});
