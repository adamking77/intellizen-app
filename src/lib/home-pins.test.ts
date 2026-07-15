import { describe, expect, it } from "vitest";

import {
  createGenuiHomePin,
  isDatabaseViewHomePin,
  isGenuiHomePin,
  parseHomePin,
  parseHomeWidgetConfigJson,
  parseHomeWidgetFilterJson,
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
  it("treats legacy database rows as database-view widgets", () => {
    const parsed = parseHomePin(first);
    expect(parsed && isDatabaseViewHomePin(parsed)).toBe(true);
    expect(parsed).toEqual(first);
  });

  it("rejects unknown durable widget kinds", () => {
    expect(parseHomePin({ ...first, kind: "script" })).toBeNull();
  });

  it("parses durable generated widgets with editable metadata", () => {
    const pin = createGenuiHomePin({
      version: 1,
      kind: "html",
      title: "Live tracker",
      html: "<p>Live</p>",
    }, [first]);
    const parsed = parseHomePin(JSON.parse(JSON.stringify({
      ...pin,
      config: { refreshMode: "mount" },
    })));

    expect(parsed && isGenuiHomePin(parsed)).toBe(true);
    expect(parsed?.title).toBe("Live tracker");
    expect(parsed?.config).toEqual({ refreshMode: "mount" });
  });

  it("validates filter and config metadata before persistence", () => {
    expect(parseHomeWidgetFilterJson('[{"fieldId":"status","op":"equals","value":"Open"}]')).toEqual([
      { fieldId: "status", op: "equals", value: "Open" },
    ]);
    expect(parseHomeWidgetConfigJson('{"groupBy":"owner"}')).toEqual({ groupBy: "owner" });
    expect(() => parseHomeWidgetFilterJson('{"fieldId":"status"}')).toThrow("Filters must be a JSON array");
    expect(() => parseHomeWidgetConfigJson("[]")).toThrow("Config must be a JSON object");
  });

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
