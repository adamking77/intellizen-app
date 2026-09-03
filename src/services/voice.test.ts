// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";

import { startBrowserDictation } from "./voice";

describe("browser dictation preview", () => {
  afterEach(() => {
    Reflect.deleteProperty(window, "webkitSpeechRecognition");
  });

  it("keeps final and interim words on separate callbacks", () => {
    let recognition: {
      onresult: ((event: unknown) => void) | null;
      stop: ReturnType<typeof vi.fn>;
    } | null = null;
    class FakeRecognition {
      continuous = false;
      interimResults = false;
      lang = "";
      onresult: ((event: unknown) => void) | null = null;
      onerror = null;
      onend = null;
      start = vi.fn();
      stop = vi.fn();
      constructor() { recognition = this; }
    }
    Object.defineProperty(window, "webkitSpeechRecognition", { configurable: true, value: FakeRecognition });
    const final: string[] = [];
    const interim: string[] = [];
    const session = startBrowserDictation({ onFinal: (text) => final.push(text), onInterim: (text) => interim.push(text) });

    recognition!.onresult?.({
      resultIndex: 0,
      results: [
        { isFinal: true, 0: { transcript: "hello " } },
        { isFinal: false, 0: { transcript: "world" } },
      ],
    });

    expect(final).toEqual(["hello"]);
    expect(interim).toEqual(["world"]);
    session?.stop();
    expect(recognition!.stop).toHaveBeenCalledOnce();
  });
});
