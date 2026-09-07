// @vitest-environment happy-dom
import { beforeEach, expect, it, vi } from "vitest";

const sonner = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), message: vi.fn(), dismiss: vi.fn() }));
vi.mock("sonner", () => ({ toast: sonner }));

import { dismissToasts, toast, toastError } from "./toast";
import { initializeSessionMode, resetSessionModeForTests, setSessionMode } from "./session-mode";

beforeEach(async () => {
  vi.clearAllMocks();
  localStorage.clear();
  resetSessionModeForTests();
  await initializeSessionMode(async () => "launch-1");
});

it("suppresses every toast entry point during Not today", () => {
  setSessionMode("not_today");
  toast.success("Saved");
  toast.info("Changed");
  toast.error("Failed");
  toastError("Failed", new Error("detail"));
  expect(sonner.success).not.toHaveBeenCalled();
  expect(sonner.message).not.toHaveBeenCalled();
  expect(sonner.error).not.toHaveBeenCalled();
});

it("restores toast presentation when the session is visible again", () => {
  setSessionMode("thinking");
  toast.success("Saved");
  toast.info("Changed");
  toast.error("Failed");
  toastError("Detailed", new Error("detail"));
  expect(sonner.success).toHaveBeenCalledWith("Saved", undefined);
  expect(sonner.message).toHaveBeenCalledWith("Changed", undefined);
  expect(sonner.error).toHaveBeenCalledTimes(2);
});

it("can clear queued notifications when Not today becomes active", () => {
  dismissToasts();
  expect(sonner.dismiss).toHaveBeenCalledOnce();
});
