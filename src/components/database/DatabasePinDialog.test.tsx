// @vitest-environment happy-dom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

import { DatabasePinDialog } from "./DatabasePinDialog";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => document.body.replaceChildren());

it("pins and removes a view in the selected workspace dashboard", async () => {
  HTMLDialogElement.prototype.showModal ??= function showModal() { this.open = true; };
  HTMLDialogElement.prototype.close ??= function close() { this.open = false; };
  const onPin = vi.fn();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const props = {
    open: true,
    destinations: [{ scope: "home" as const, label: "Home" }, { scope: "workspace:client" as const, label: "Client work" }],
    onOpenChange: vi.fn(),
    onPin,
    onOpenDashboard: vi.fn(),
  };

  await act(async () => root.render(<DatabasePinDialog {...props} pinnedDestinations={[]} />));
  const picker = host.querySelector("select")!;
  await act(async () => picker.dispatchEvent(new Event("change", { bubbles: true })));
  picker.value = "workspace:client";
  await act(async () => picker.dispatchEvent(new Event("change", { bubbles: true })));
  await act(async () => [...host.querySelectorAll("button")].find((button) => button.textContent === "Pin view")?.click());
  expect(onPin).toHaveBeenCalledWith("workspace:client");

  await act(async () => root.render(<DatabasePinDialog {...props} pinnedDestinations={["workspace:client"]} />));
  await act(async () => picker.dispatchEvent(new Event("change", { bubbles: true })));
  picker.value = "workspace:client";
  await act(async () => picker.dispatchEvent(new Event("change", { bubbles: true })));
  await act(async () => [...host.querySelectorAll("button")].find((button) => button.textContent === "Remove pin")?.click());
  expect(onPin).toHaveBeenLastCalledWith("workspace:client");
  await act(async () => root.unmount());
});
