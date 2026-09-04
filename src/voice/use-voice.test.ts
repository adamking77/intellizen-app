import { describe, expect, it } from "vitest";

import type { Message } from "@/engine/transcript";
import { joinVoiceText, nextToSpeak } from "./use-voice";
import { DEFAULT_VOICE, parseVoiceConfig } from "./voice-prefs";

const m = (over: Partial<Message>): Message => ({ id: "1", from: "default", text: "Hello.", ...over });

describe("nextToSpeak", () => {
  it("speaks only a settled, unspoken agent reply that is last", () => {
    expect(nextToSpeak([], new Set())).toBeNull();
    expect(nextToSpeak([m({ from: "you" })], new Set())).toBeNull();
    expect(nextToSpeak([m({ streaming: true })], new Set())).toBeNull();
    expect(nextToSpeak([m({ failed: "boom" })], new Set())).toBeNull();
    expect(nextToSpeak([m({ text: "  " })], new Set())).toBeNull();
    expect(nextToSpeak([m({})], new Set(["1"]))).toBeNull();
    expect(nextToSpeak([m({ id: "0", from: "you" }), m({})], new Set())?.id).toBe("1");
  });
});

describe("joinVoiceText", () => {
  it("shows interim words after the existing draft without changing either source", () => {
    expect(joinVoiceText("Existing note  ", " live words ")).toBe("Existing note live words");
    expect(joinVoiceText("", "live words")).toBe("live words");
  });
});

describe("parseVoiceConfig", () => {
  it("falls back to both halves off", () => {
    expect(parseVoiceConfig(null)).toEqual(DEFAULT_VOICE);
    expect(parseVoiceConfig("not json")).toEqual(DEFAULT_VOICE);
  });
  it("reads a saved config and drops unknown shapes", () => {
    const got = parseVoiceConfig(JSON.stringify({ dictation: { enabled: true, service: "local", model: "whisper:base" }, speaking: 4 }));
    expect(got.dictation).toEqual({ enabled: true, service: "local", model: "whisper:base", apiKey: "", language: "en" });
    expect(got.speaking.enabled).toBe(false);
  });
  it("preserves the dictation language from voice settings", () => {
    const got = parseVoiceConfig(JSON.stringify({ dictation: { language: "es" } }));
    expect(got.dictation.language).toBe("es");
  });
});
