import { expect, it } from "vitest";
import { teamForRoom } from "./team-room";
it("recognizes a suffixed team room by name and exact roster, without selecting another team", () => {
  const teams = [{ id: "build", name: "Build team", members: ["hermes:fiona", "acp:keel"], projects: [] }];
  const room = { name: "Build team 3", log: [], watermarks: {}, members: [{ name: "keel", door: "acp" as const }, { name: "fiona", door: "gateway" as const }] };
  expect(teamForRoom(teams, room)?.id).toBe("build");
  expect(teamForRoom(teams, { ...room, members: room.members.slice(0, 1) })).toBeUndefined();
});
