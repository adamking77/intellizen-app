// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

import { WeekTheme } from "./week-theme";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | null = null;
let host: HTMLDivElement | null = null;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.useRealTimers();
});

it("keeps the full weekly rotation label available when the compact header truncates", async () => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);

  await act(async () => root?.render(<WeekTheme now={new Date("2026-04-06T12:00:00")} />));

  const label = host.querySelector("span");
  expect(label?.textContent).toBe("Ops week · 7 days remaining");
  expect(label?.title).toBe("Ops week · 7 days remaining");
  expect(label?.classList.contains("truncate")).toBe(true);
});

it("refreshes at local midnight when the app stays open", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 3, 5, 23, 59, 59));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);

  await act(async () => root?.render(<WeekTheme />));
  expect(host.textContent).toBe("Marketing week · 1 day remaining");

  await act(async () => vi.advanceTimersByTimeAsync(1_000));
  expect(host.textContent).toBe("Ops week · 7 days remaining");
});
