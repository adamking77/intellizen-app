import { describe, expect, it } from "vitest";

import {
  createGenuiHomePin,
  createInstrumentHomePin,
  createPluginHomePin,
  isDatabaseViewHomePin,
  isGenuiHomePin,
  isInstrumentHomePin,
  isPluginHomePin,
  parseHomePin,
  parseHomeWidgetConfigJson,
  parseHomeWidgetFilterJson,
  patchHomePinPlacements,
  removeHomePinById,
  restoreHomePin,
  toggleInstrumentHomePin,
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

  it("parses durable plugin widgets from their shared Home Pin payload", () => {
    const pin = createPluginHomePin([first], { pluginId: "weather", widgetId: "forecast", title: "Forecast" });
    expect(parseHomePin(pin)).toEqual(pin);
    const parsed = parseHomePin({
      ...pin,
      pluginId: undefined,
      widgetId: undefined,
      widget: { pluginId: pin.pluginId, widgetId: pin.widgetId },
    });

    expect(parsed && isPluginHomePin(parsed)).toBe(true);
    expect(parsed).toMatchObject({ kind: "plugin", pluginId: "weather", widgetId: "forecast", title: "Forecast" });
  });

  it("parses durable activity instruments from their shared Home Pin payload", () => {
    const pin = createInstrumentHomePin([first], { instrumentId: "attention.waiting", title: "Waits on you" });
    const parsed = parseHomePin({
      ...pin,
      instrumentId: undefined,
      widget: { instrumentId: pin.instrumentId },
    });

    expect(parsed && isInstrumentHomePin(parsed)).toBe(true);
    expect(parsed).toMatchObject({ kind: "instrument", instrumentId: "attention.waiting", title: "Waits on you" });
  });

  it("pins and unpins an activity instrument without touching other pins", () => {
    const pinned = toggleInstrumentHomePin([first], { instrumentId: "attention.waiting", title: "Waits on you" });
    expect(pinned).toHaveLength(2);
    expect(pinned.some((pin) => isInstrumentHomePin(pin) && pin.instrumentId === "attention.waiting")).toBe(true);
    expect(toggleInstrumentHomePin(pinned, { instrumentId: "attention.waiting", title: "Waits on you" })).toEqual([first]);
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
