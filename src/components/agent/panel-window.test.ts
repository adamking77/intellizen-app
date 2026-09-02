import { describe, expect, it } from "vitest";

import { ejectReducer, panelModeReducer, sizeFor } from "./panel-window";

describe("ejected panel state", () => {
  it("returns the conversation home when opening fails or the window closes", () => {
    expect(ejectReducer("docked", { type: "eject" })).toBe("ejecting");
    expect(ejectReducer("ejecting", { type: "opened" })).toBe("ejected");
    expect(ejectReducer("ejected", { type: "closed" })).toBe("docked");
    expect(ejectReducer("ejecting", { type: "failed" })).toBe("docked");
  });

  it("reduces to a fixed HUD and grows back to the panel", () => {
    const hud = panelModeReducer({ hud: false, open: "none" }, { type: "reduce" });
    expect(hud).toEqual({ hud: true, open: "none" });
    expect(sizeFor(hud)).toEqual({ w: 468, h: 126 });
    const chat = panelModeReducer(hud, { type: "open", open: "chat" });
    expect(sizeFor(chat)).toEqual({ w: 496, h: 406 });
    expect(panelModeReducer(chat, { type: "grow" })).toEqual({ hud: false, open: "none" });
  });
});
