import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeGatewayClient } from "@/engine/test-support";

const hermesRest = vi.hoisted(() => vi.fn());
vi.mock("@/engine/rest", () => ({ hermesRest }));

import { getHermesSessionMessages, listHermesProjectSessions, listHermesSidebarSessions } from "./hermes-project-sessions";

beforeEach(() => hermesRest.mockReset());

describe("Hermes project sessions", () => {
  it("asks Hermes for each profile's owning project and hydrated sessions", async () => {
    const client = new FakeGatewayClient();
    client.respondWith((call) => {
      if (call.method === "profiles.list") return { profiles: [{ name: "keel" }, { name: "fiona" }] };
      if (call.method === "projects.for_cwd") {
        return { project: { id: call.params.profile === "keel" ? "p_app" : "p_other" } };
      }
      if (call.method === "projects.project_sessions") return { project: { repos: [{ groups: [{ sessions: [
        call.params.profile === "keel"
          ? { id: "inside", title: "Build", profile: "keel", cwd: "/work/app/src", last_active: 20, message_count: 4 }
          : { id: "outside", title: "Other", profile: "fiona", cwd: "/work/app-old", last_active: 30, message_count: 8 },
      ] }] }] } };
    });

    await expect(listHermesProjectSessions(["/work/app"], client)).resolves.toMatchObject([
      { id: "inside", profile: "keel", cwd: "/work/app/src", messageCount: 4 },
    ]);
    expect(client.callsTo("projects.for_cwd").map((call) => call.params)).toEqual([
      { profile: "keel", cwd: "/work/app" },
      { profile: "fiona", cwd: "/work/app" },
    ]);
    expect(client.callsTo("projects.project_sessions").map((call) => call.params)).toEqual([
      { profile: "keel", project_id: "p_app" },
      { profile: "fiona", project_id: "p_other" },
    ]);
  });

  it("uses Hermes's bounded sidebar slice and deduplicates pinned rows", async () => {
    hermesRest.mockResolvedValueOnce({ recents: { sessions: [
        { id: "new", profile: "keel", last_active: 30 },
        { id: "pinned", profile: "fiona", last_active: 20 },
        { id: "pinned", profile: "fiona", last_active: 20 },
      ] } });

    await expect(listHermesSidebarSessions()).resolves.toMatchObject([
      { id: "new", profile: "keel" },
      { id: "pinned", profile: "fiona" },
    ]);
    expect(hermesRest).toHaveBeenCalledOnce();
    expect(hermesRest).toHaveBeenCalledWith(
      "/api/profiles/sessions/sidebar?recents_profile=all&recents_limit=500&recents_exclude=cron%2Ckanban%2Ctool&cron_limit=1&messaging_limit=1",
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
