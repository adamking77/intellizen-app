import { describe, expect, it } from "vitest";

import {
  INITIAL_LIVE_VOICE_STATE,
  liveVoicePhaseLabel,
  liveVoiceReducer,
} from "@/lib/live-voice-session";

describe("live voice session state", () => {
  it("runs a truthful sequential listening to speaking turn", () => {
    let state = liveVoiceReducer(INITIAL_LIVE_VOICE_STATE, { type: "START", available: true });
    expect(state.phase).toBe("listening");

    state = liveVoiceReducer(state, { type: "TRANSCRIPT", final: "Review the brief" });
    state = liveVoiceReducer(state, { type: "TRANSCRIBING" });
    state = liveVoiceReducer(state, { type: "THINKING", transcript: state.transcript });
    state = liveVoiceReducer(state, { type: "SPEAKING" });
    expect(liveVoicePhaseLabel(state.phase)).toBe("Fiona is speaking");

    state = liveVoiceReducer(state, { type: "TURN_COMPLETE" });
    expect(state).toMatchObject({ active: true, phase: "listening", transcript: "" });
  });

  it("keeps the session muted after a response finishes", () => {
    let state = liveVoiceReducer(INITIAL_LIVE_VOICE_STATE, { type: "START", available: true });
    state = liveVoiceReducer(state, { type: "MUTE" });
    state = liveVoiceReducer(state, { type: "SPEAKING" });
    state = liveVoiceReducer(state, { type: "TURN_COMPLETE" });
    expect(state).toMatchObject({ active: true, muted: true, phase: "muted" });
  });

  it("keeps interruption available when the mic changes during an in-flight reply", () => {
    let state = liveVoiceReducer(INITIAL_LIVE_VOICE_STATE, { type: "START", available: true });
    state = liveVoiceReducer(state, { type: "TRANSCRIBING" });
    state = liveVoiceReducer(state, { type: "MUTE" });
    expect(state).toMatchObject({ phase: "transcribing", muted: true });

    state = liveVoiceReducer(state, { type: "THINKING", transcript: "Review the brief" });
    expect(state).toMatchObject({ phase: "thinking", muted: true });

    state = liveVoiceReducer(state, { type: "SPEAKING" });
    state = liveVoiceReducer(state, { type: "UNMUTE" });
    expect(state).toMatchObject({ phase: "speaking", muted: false });
  });

  it("surfaces unavailable and error states without claiming a live session", () => {
    const unavailable = liveVoiceReducer(INITIAL_LIVE_VOICE_STATE, {
      type: "START",
      available: false,
      reason: "Fiona streaming is offline.",
    });
    expect(unavailable).toMatchObject({ active: true, phase: "unavailable", error: "Fiona streaming is offline." });

    const failed = liveVoiceReducer(
      liveVoiceReducer(INITIAL_LIVE_VOICE_STATE, { type: "START", available: true }),
      { type: "FAIL", message: "Microphone permission was denied." },
    );
    expect(failed).toMatchObject({ active: true, phase: "error", error: "Microphone permission was denied." });
  });

  it("ends cleanly from any active phase", () => {
    const speaking = liveVoiceReducer(
      liveVoiceReducer(INITIAL_LIVE_VOICE_STATE, { type: "START", available: true }),
      { type: "SPEAKING" },
    );
    expect(liveVoiceReducer(speaking, { type: "END" })).toEqual(INITIAL_LIVE_VOICE_STATE);
  });
});
