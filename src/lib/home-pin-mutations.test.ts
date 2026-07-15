import { describe, expect, it, vi } from "vitest";

import { mutateAuthoritativeHomePins } from "@/lib/home-pin-mutations";
import { patchHomePinPlacements, type HomePin } from "@/lib/home-pins";

const first: HomePin = {
  id: "pin-a",
  databaseId: "db-a",
  viewId: "view-a",
  x: 0,
  y: 0,
  w: 6,
  h: 8,
};

const concurrent: HomePin = {
  id: "pin-new",
  databaseId: "db-new",
  viewId: "view-new",
  x: 6,
  y: 0,
  w: 6,
  h: 8,
};

describe("mutateAuthoritativeHomePins", () => {
  it("transforms a fresh remote snapshot and verifies the saved readback", async () => {
    const verified = { ...first, x: 4 };
    const read = vi.fn()
      .mockResolvedValueOnce([first, concurrent])
      .mockResolvedValueOnce([verified, concurrent]);
    const write = vi.fn().mockResolvedValue(undefined);

    const result = await mutateAuthoritativeHomePins({
      read,
      write,
      transform: (pins) => patchHomePinPlacements(
        pins,
        [{ id: first.id, x: 3, y: 8, w: 9, h: 12 }],
      ),
    });

    expect(write).toHaveBeenCalledWith([
      { ...first, x: 3, y: 8, w: 9, h: 12 },
      concurrent,
    ]);
    expect(result.authoritative).toEqual([verified, concurrent]);
  });
});
