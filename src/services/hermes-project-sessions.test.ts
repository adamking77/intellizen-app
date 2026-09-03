import { beforeEach, describe, expect, it, vi } from "vitest";

const hermesRest = vi.hoisted(() => vi.fn());
vi.mock("@/engine/rest", () => ({ hermesRest }));

import { getHermesSessionMessages, listHermesProjectSessions, listHermesSessions } from "./hermes-project-sessions";

beforeEach(() => hermesRest.mockReset());

describe("Hermes project sessions", () => {
  it("keeps only sessions filed beneath the project folders", async () => {
    hermesRest.mockResolvedValueOnce({ total: 2, sessions: [
      { id: "inside", title: "Build", profile: "keel", cwd: "/work/app/src", last_active: 20, message_count: 4 },
      { id: "outside", title: "Other", profile: "fiona", cwd: "/work/app-old", last_active: 30, message_count: 8 },
    ] });

    await expect(listHermesProjectSessions(["/work/app"])).resolves.toMatchObject([
      { id: "inside", profile: "keel", cwd: "/work/app/src", messageCount: 4 },
    ]);
    expect(hermesRest).toHaveBeenCalledWith(
      "/api/profiles/sessions?limit=500&offset=0&min_messages=1&archived=exclude&order=recent&profile=all&exclude_sources=cron%2Ckanban%2Ctool",
    );
  });

  it("paginates the Hermes cap and deduplicates pinned rows", async () => {
    hermesRest
      .mockResolvedValueOnce({ total: 501, sessions: [
        { id: "new", profile: "keel", last_active: 30 },
        { id: "pinned", profile: "fiona", last_active: 20 },
      ] })
      .mockResolvedValueOnce({ total: 501, sessions: [
        { id: "old", profile: "keel", last_active: 10 },
        { id: "pinned", profile: "fiona", last_active: 20 },
      ] });

    await expect(listHermesSessions()).resolves.toMatchObject([
      { id: "new", profile: "keel" },
      { id: "pinned", profile: "fiona" },
      { id: "old", profile: "keel" },
    ]);
    expect(hermesRest).toHaveBeenNthCalledWith(
      2,
      "/api/profiles/sessions?limit=500&offset=500&min_messages=1&archived=exclude&order=recent&profile=all&exclude_sources=cron%2Ckanban%2Ctool",
    );
  });

  it("reads profile-scoped messages and normalizes structured content", async () => {
    hermesRest.mockResolvedValueOnce({ messages: [
      { row_id: 1, role: "user", content: "Ship it" },
      { row_id: 2, role: "assistant", content: [{ text: "Done" }] },
      { row_id: 3, role: "event", content: "ignored" },
    ] });

    await expect(getHermesSessionMessages("session/id", "keel profile")).resolves.toEqual([
      { id: "1", role: "user", text: "Ship it", name: null, timestamp: null },
      { id: "2", role: "assistant", text: "Done", name: null, timestamp: null },
    ]);
    expect(hermesRest).toHaveBeenCalledWith(
      "/api/sessions/session%2Fid/messages?profile=keel+profile&limit=500&offset=0&order=latest&include_compacted=true",
    );
  });
});
