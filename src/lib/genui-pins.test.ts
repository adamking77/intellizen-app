import { describe, expect, it, vi } from "vitest";

import type { AgentChatWidget } from "@/lib/agent-widgets";
import { pinGenuiWidget } from "@/lib/genui-pins";
import type { HomePin } from "@/lib/home-pins";

const widget: AgentChatWidget = {
  version: 1,
  kind: "data-insights",
  title: "Morning brief",
  insights: ["One decision needs review."],
};

describe("GenUI pin persistence", () => {
  it("only returns a pin after the remote-authoritative readback contains it", async () => {
    let remote: HomePin[] = [];
    const read = vi.fn(async () => remote);
    const write = vi.fn(async (pins: HomePin[]) => {
      remote = pins;
    });

    const pin = await pinGenuiWidget(widget, { read, write });

    expect(pin.kind).toBe("genui");
    expect(pin.widget).toEqual(widget);
    expect(remote).toContainEqual(pin);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("surfaces remote failures instead of claiming the widget was pinned", async () => {
    const read = vi.fn(async () => [] as HomePin[]);
    const write = vi.fn(async () => {
      throw new Error("Workspace unavailable");
    });

    await expect(pinGenuiWidget(widget, { read, write })).rejects.toThrow("Workspace unavailable");
  });
});
