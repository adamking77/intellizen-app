import { afterEach, describe, expect, it, vi } from "vitest";

import { useEngineStore } from "@/engine/engine-store";
import { subscribeKanbanEvents } from "./hermes-kanban";

describe("Hermes kanban events", () => {
  afterEach(() => useEngineStore.getState().setInfo(null));

  it("resumes from the board cursor and projects event frames", () => {
    useEngineStore.getState().setInfo({
      mode: "attached",
      pid: 12,
      port: 56083,
      token: "secret",
      version: "1",
      url: "http://127.0.0.1:56083",
    });
    const socket = { close: vi.fn(), onclose: null, onmessage: null };
    const frames = vi.fn();
    const stop = subscribeKanbanEvents(
      "app",
      41,
      frames,
      (url) => {
        expect(url).toContain("board=app&since=41");
        return socket as unknown as Pick<WebSocket, "close" | "onclose" | "onmessage">;
      },
    );

    (socket.onmessage as ((event: { data: string }) => void) | null)?.({
      data: JSON.stringify({ cursor: 43, events: [{ id: 42, task_id: "card-1", kind: "status_changed" }] }),
    });
    expect(frames).toHaveBeenCalledWith([{ id: 42, taskId: "card-1", kind: "status_changed" }]);

    stop();
    expect(socket.close).toHaveBeenCalledOnce();
  });
});
