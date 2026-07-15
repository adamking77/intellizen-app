import { afterEach, describe, expect, it, vi } from "vitest";

import type { AgentChatWidget } from "@/lib/agent-widgets";
import { loadGenuiPins, pinGenuiWidget } from "@/lib/genui-pins";

const widget: AgentChatWidget = {
  version: 1,
  kind: "data-insights",
  title: "Morning brief",
  insights: ["One decision needs review."],
};

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GenUI pin persistence", () => {
  it("only returns a pin after it can be read back from storage", () => {
    const localStorage = new MemoryStorage();
    vi.stubGlobal("window", { localStorage });

    const pin = pinGenuiWidget(widget);

    expect(loadGenuiPins()).toEqual([pin]);
  });

  it("surfaces storage failures instead of claiming the widget was pinned", () => {
    const localStorage = new MemoryStorage();
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    vi.stubGlobal("window", { localStorage });

    expect(() => pinGenuiWidget(widget)).toThrow("Storage unavailable");
    expect(loadGenuiPins()).toEqual([]);
  });
});
