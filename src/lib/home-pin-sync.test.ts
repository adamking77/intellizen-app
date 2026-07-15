import { describe, expect, it } from "vitest";

import { homePinIdentitySignature } from "@/lib/home-pin-sync";
import type { HomePin } from "@/lib/home-pins";

const first: HomePin = {
  id: "pin-a",
  databaseId: "database-a",
  viewId: "view-a",
  x: 0,
  y: 0,
  w: 6,
  h: 8,
};

const second: HomePin = {
  id: "pin-b",
  databaseId: "database-b",
  viewId: "view-b",
  x: 6,
  y: 0,
  w: 6,
  h: 8,
};

describe("homePinIdentitySignature", () => {
  it("is independent of the order returned by Supabase", () => {
    expect(homePinIdentitySignature([first, second])).toBe(
      homePinIdentitySignature([second, first]),
    );
  });

  it("changes when a pin is added or removed", () => {
    expect(homePinIdentitySignature([first, second])).not.toBe(
      homePinIdentitySignature([first]),
    );
  });

  it("changes when a pin points to a different view", () => {
    expect(homePinIdentitySignature([first])).not.toBe(
      homePinIdentitySignature([{ ...first, viewId: "view-c" }]),
    );
  });

  it("ignores placement-only changes", () => {
    expect(homePinIdentitySignature([first])).toBe(
      homePinIdentitySignature([{ ...first, x: 3, y: 16, w: 9, h: 12 }]),
    );
  });
});
