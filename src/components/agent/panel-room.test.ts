// @vitest-environment happy-dom
import { beforeEach, expect, it, vi } from "vitest";
import { $groupChats, $groupClarify } from "@/rooms/group-chat";
import { sendHostedRoom } from "@/rooms/hermes-hosted";
import { sendToGroupChat } from "@/rooms/group-rounds";
import { respondGroupApproval } from "@/rooms/group-turns";
import { readPanelDraft, writePanelDraft } from "./panel-draft";
import { roomSnapshot, runRoomAction } from "./panel-room";

vi.mock("@/rooms/hermes-hosted", () => ({ sendHostedRoom: vi.fn(async () => ({ eventId: "room-user", threadId: "room-thread" })), refreshHostedRoom: vi.fn(), stopHostedRoom: vi.fn(), approveHostedRoom: vi.fn() }));
vi.mock("@/rooms/group-rounds", () => ({ sendToGroupChat: vi.fn(), stopGroupThread: vi.fn() }));
vi.mock("@/rooms/group-turns", () => ({ clearGroupPrompt: vi.fn(), respondGroupApproval: vi.fn() }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(sendHostedRoom).mockResolvedValue({ eventId: "room-user", threadId: "room-thread" });
  localStorage.clear();
  $groupClarify.set({});
  $groupChats.set({ team: { name: "Build team", log: [], watermarks: {}, owner: "hermes", members: [] } });
});

function approvalPrompt(member: string) {
  return {
    at: 1,
    group: "team",
    member,
    memberKey: member,
    sessionId: `${member}-session`,
    thread: null,
    decision: { kind: "approval" as const, requestId: "shared", command: "write", description: "Write output", choices: ["once" as const], messageId: "m1", at: 1 },
  };
}

it("sends through the room owner once and clears only the accepted draft", async () => {
  writePanelDraft("room:team", { text: "Review this", attachments: [] });
  await runRoomAction({ type: "room-send", roomId: "team", text: "Review this" });
  expect(sendHostedRoom).toHaveBeenCalledExactlyOnceWith("team", "Review this", undefined, null);
  expect(sendToGroupChat).not.toHaveBeenCalled();
  expect(readPanelDraft("room:team").text).toBe("");
});

it("preserves a draft revised while the send was pending, even with identical text", async () => {
  let accept!: () => void;
  vi.mocked(sendHostedRoom).mockImplementation(() => new Promise((resolve) => {
    accept = () => resolve({ eventId: "room-user", threadId: "room-thread" });
  }));
  writePanelDraft("room:team", { text: "Review this", attachments: [] });
  const sending = runRoomAction({ type: "room-send", roomId: "team", text: "Review this" });
  writePanelDraft("room:team", { text: "Review this", attachments: [] });
  accept();
  await sending;
  expect(readPanelDraft("room:team").text).toBe("Review this");
});

it("can send outside the room composer without clearing its matching draft", async () => {
  writePanelDraft("room:team", { text: "Review this", attachments: [] });
  await runRoomAction({ type: "room-send", roomId: "team", text: "Review this", preservePanelDraft: true });
  expect(sendHostedRoom).toHaveBeenCalledExactlyOnceWith("team", "Review this", undefined, null);
  expect(readPanelDraft("room:team").text).toBe("Review this");
});

it("rejects a detached decision when the same request id now belongs to another member", async () => {
  const members = [{ name: "a", door: "gateway" as const }, { name: "b", door: "gateway" as const }];
  $groupChats.set({ team: { name: "Build team", log: [], watermarks: {}, owner: "local", members } });
  $groupClarify.set({ "team::a": approvalPrompt("a") });
  const old = { type: "room-approve" as const, roomId: "team", memberKey: "a", requestId: "shared", choice: "once" as const };
  $groupClarify.set({ "team::b": approvalPrompt("b") });

  await expect(runRoomAction(old)).rejects.toThrow("no longer pending");
  expect(respondGroupApproval).not.toHaveBeenCalled();
});

it("serializes room decisions before dispatching a duplicate", async () => {
  const members = [{ name: "a", door: "gateway" as const }];
  $groupChats.set({ team: { name: "Build team", log: [], watermarks: {}, owner: "local", members } });
  $groupClarify.set({ "team::a": approvalPrompt("a") });
  let accept!: () => void;
  vi.mocked(respondGroupApproval).mockImplementation(() => new Promise<void>((resolve) => { accept = resolve; }));
  const action = { type: "room-approve" as const, roomId: "team", memberKey: "a", requestId: "shared", choice: "once" as const };

  const first = runRoomAction(action);
  await Promise.resolve();
  await expect(runRoomAction(action)).rejects.toThrow("already being sent");
  expect(respondGroupApproval).toHaveBeenCalledTimes(1);
  accept();
  await first;
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
