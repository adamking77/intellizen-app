import { describe, expect, it } from "vitest";

import {
  patchHomePinPlacements,
  removeHomePinById,
  restoreHomePin,
  type HomePin,
} from "@/lib/home-pins";

const first: HomePin = {
  id: "pin-a",
  databaseId: "db-a",
  viewId: "view-a",
  x: 0,
  y: 0,
  w: 6,
  h: 8,
};

const second: HomePin = {
  id: "pin-b",
  databaseId: "db-b",
  viewId: "view-b",
  x: 6,
  y: 0,
  w: 6,
  h: 8,
};

describe("Home pin mutations", () => {
  it("patches placement without dropping pins outside the edited layout", () => {
    expect(
      patchHomePinPlacements(
        [first, second],
        [{ id: "pin-a", x: 3, y: 8, w: 9, h: 12 }],
      ),
    ).toEqual([
      { ...first, x: 3, y: 8, w: 9, h: 12 },
      second,
    ]);
  });

  it("removes only the requested pin id", () => {
    expect(removeHomePinById([first, second], first.id)).toEqual([second]);
  });

  it("restores an unpinned view once without duplicating an equivalent pin", () => {
    expect(restoreHomePin([second], first)).toEqual([second, first]);
    expect(restoreHomePin([first, second], first)).toEqual([first, second]);
    expect(restoreHomePin([{ ...first, id: "replacement" }], first)).toEqual([
      { ...first, id: "replacement" },
    ]);
  });
});
