// @vitest-environment happy-dom
import { beforeEach, expect, it, vi } from "vitest";
import { $groupChats } from "@/rooms/group-chat";
import { sendHostedRoom } from "@/rooms/hermes-hosted";
import { sendToGroupChat } from "@/rooms/group-rounds";
import { readPanelDraft, writePanelDraft } from "./panel-draft";
import { roomSnapshot, runRoomAction } from "./panel-room";

vi.mock("@/rooms/hermes-hosted", () => ({ sendHostedRoom: vi.fn(), refreshHostedRoom: vi.fn(), stopHostedRoom: vi.fn(), approveHostedRoom: vi.fn() }));
vi.mock("@/rooms/group-rounds", () => ({ sendToGroupChat: vi.fn(), stopGroupThread: vi.fn() }));

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  $groupChats.set({ team: { name: "Build team", log: [], watermarks: {}, owner: "hermes", members: [] } });
});

it("sends through the room owner once and clears only the accepted draft", async () => {
  writePanelDraft("room:team", { text: "Review this", attachments: [] });
  await runRoomAction({ type: "room-send", roomId: "team", text: "Review this" });
  expect(sendHostedRoom).toHaveBeenCalledExactlyOnceWith("team", "Review this");
  expect(sendToGroupChat).not.toHaveBeenCalled();
  expect(readPanelDraft("room:team").text).toBe("");
});

it("preserves a draft revised while the send was pending, even with identical text", async () => {
  let accept!: () => void;
  vi.mocked(sendHostedRoom).mockImplementation(() => new Promise<void>((resolve) => { accept = resolve; }));
  writePanelDraft("room:team", { text: "Review this", attachments: [] });
  const sending = runRoomAction({ type: "room-send", roomId: "team", text: "Review this" });
  writePanelDraft("room:team", { text: "Review this", attachments: [] });
  accept();
  await sending;
  expect(readPanelDraft("room:team").text).toBe("Review this");
});

it("preserves the draft on failure and rejects actions against deleted rooms", async () => {
  vi.mocked(sendHostedRoom).mockRejectedValue(new Error("Offline"));
  writePanelDraft("room:team", { text: "Keep me", attachments: [] });
  await expect(runRoomAction({ type: "room-send", roomId: "team", text: "Keep me" })).rejects.toThrow("Offline");
  expect(readPanelDraft("room:team").text).toBe("Keep me");
  $groupChats.set({});
  expect(roomSnapshot("team")?.room).toBeNull();
  await expect(runRoomAction({ type: "room-stop", roomId: "team" })).rejects.toThrow("no longer available");
});
