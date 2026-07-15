import { describe, expect, it } from "vitest";

import {
  buildSteeredAgentPanelHistory,
  countUnreadAgentPanelReplies,
  filterAgentPanelChatReceipts,
  latestAgentPanelReplyAt,
} from "@/lib/agent-panel-chat";

const receipts = [
  { message: "Review Dawson", targetAgent: "fiona", reply: "Ready", repliedAt: "2026-07-15T08:00:00.000Z" },
  { message: "Check reports", targetAgent: "fiona", reply: "Two changed", repliedAt: "2026-07-15T09:00:00.000Z" },
  { message: "Still running", targetAgent: "fiona", reply: null, repliedAt: null },
];

describe("Agent Panel conversation helpers", () => {
  it("searches both sides of historical messages", () => {
    expect(filterAgentPanelChatReceipts(receipts, "two changed")).toEqual([receipts[1]]);
    expect(filterAgentPanelChatReceipts(receipts, "dawson")).toEqual([receipts[0]]);
  });

  it("derives unread replies and the latest completion timestamp", () => {
    expect(countUnreadAgentPanelReplies(receipts, "2026-07-15T08:30:00.000Z")).toBe(1);
    expect(latestAgentPanelReplyAt(receipts)).toBe("2026-07-15T09:00:00.000Z");
  });

  it("preserves the interrupted exchange when steering and keeps history bounded", () => {
    const history = Array.from({ length: 12 }, (_, index) => ({
      role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `Turn ${index}`,
    }));

    const steered = buildSteeredAgentPanelHistory(history, "Original request", "Partial answer");

    expect(steered).toHaveLength(12);
    expect(steered.slice(-2)).toEqual([
      { role: "user", content: "Original request" },
      { role: "assistant", content: "Partial answer" },
    ]);
  });
});
