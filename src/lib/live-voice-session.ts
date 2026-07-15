export type LiveVoicePhase =
  | "idle"
  | "unavailable"
  | "listening"
  | "transcribing"
  | "thinking"
  | "speaking"
  | "muted"
  | "error";

export interface LiveVoiceState {
  phase: LiveVoicePhase;
  active: boolean;
  muted: boolean;
  transcript: string;
  interimTranscript: string;
  error: string | null;
}

export type LiveVoiceEvent =
  | { type: "START"; available: boolean; reason?: string }
  | { type: "LISTENING" }
  | { type: "TRANSCRIPT"; final?: string; interim?: string }
  | { type: "TRANSCRIBING" }
  | { type: "THINKING"; transcript: string }
  | { type: "SPEAKING" }
  | { type: "TURN_COMPLETE" }
  | { type: "MUTE" }
  | { type: "UNMUTE" }
  | { type: "INTERRUPT" }
  | { type: "FAIL"; message: string }
  | { type: "END" };

export const INITIAL_LIVE_VOICE_STATE: LiveVoiceState = {
  phase: "idle",
  active: false,
  muted: false,
  transcript: "",
  interimTranscript: "",
  error: null,
};

export function liveVoiceReducer(state: LiveVoiceState, event: LiveVoiceEvent): LiveVoiceState {
  switch (event.type) {
    case "START":
      return event.available
        ? { ...INITIAL_LIVE_VOICE_STATE, active: true, phase: "listening" }
        : {
            ...INITIAL_LIVE_VOICE_STATE,
            active: true,
            phase: "unavailable",
            error: event.reason ?? "Live voice is unavailable.",
          };
    case "LISTENING":
      return state.active
        ? { ...state, phase: state.muted ? "muted" : "listening", transcript: "", interimTranscript: "", error: null }
        : state;
    case "TRANSCRIPT":
      return {
        ...state,
        transcript: appendTranscript(state.transcript, event.final),
        interimTranscript: event.interim?.trim() ?? state.interimTranscript,
      };
    case "TRANSCRIBING":
      return state.active ? { ...state, phase: "transcribing", interimTranscript: "", error: null } : state;
    case "THINKING":
      return state.active
        ? { ...state, phase: "thinking", transcript: event.transcript.trim(), interimTranscript: "", error: null }
        : state;
    case "SPEAKING":
      return state.active ? { ...state, phase: "speaking", error: null } : state;
    case "TURN_COMPLETE":
    case "INTERRUPT":
      return state.active
        ? {
            ...state,
            phase: state.muted ? "muted" : "listening",
            transcript: "",
            interimTranscript: "",
            error: null,
          }
        : state;
    case "MUTE":
      return state.active
        ? {
            ...state,
            muted: true,
            phase: isInFlightPhase(state.phase) ? state.phase : "muted",
            interimTranscript: "",
          }
        : state;
    case "UNMUTE":
      return state.active
        ? {
            ...state,
            muted: false,
            phase: isInFlightPhase(state.phase) ? state.phase : "listening",
            transcript: isInFlightPhase(state.phase) ? state.transcript : "",
            interimTranscript: "",
            error: null,
          }
        : state;
    case "FAIL":
      return state.active ? { ...state, phase: "error", error: event.message, interimTranscript: "" } : state;
    case "END":
      return INITIAL_LIVE_VOICE_STATE;
  }
}

export function liveVoicePhaseLabel(phase: LiveVoicePhase) {
  switch (phase) {
    case "idle":
      return "Voice session ended";
    case "unavailable":
      return "Live voice unavailable";
    case "listening":
      return "Listening";
    case "transcribing":
      return "Transcribing";
    case "thinking":
      return "Fiona is thinking";
    case "speaking":
      return "Fiona is speaking";
    case "muted":
      return "Microphone muted";
    case "error":
      return "Voice session needs attention";
  }
}

function isInFlightPhase(phase: LiveVoicePhase) {
  return phase === "transcribing" || phase === "thinking" || phase === "speaking";
}

function appendTranscript(current: string, addition?: string) {
  const next = addition?.trim();
  if (!next) return current;
  return `${current.trim()}${current.trim() ? " " : ""}${next}`;
}
