/** How the app listens and how it speaks. Two independent halves, both off
 *  by default: wanting dictation does not imply wanting replies read aloud.
 *  Shared by the settings page and every surface with a composer, so a
 *  change in Settings is live in the panel without a reload. */

import { create } from "zustand";

import { readPreference, writePreference } from "@/lib/settings-preferences";

export interface SpeechService {
  enabled: boolean;
  /** Empty until one is chosen. A string rather than a union so a service
   *  added later needs no type change here. */
  service: string;
  /** Model id, or `whisper:base` style engine id for dictation. */
  model: string;
  /** Recorded, not yet used: credentials come from the environment. */
  apiKey: string;
}

export interface VoiceConfig {
  dictation: SpeechService;
  speaking: SpeechService;
}

export const VOICE_PREFS_KEY = "intelizen:voice";

const OFF: SpeechService = { enabled: false, service: "", model: "", apiKey: "" };
export const DEFAULT_VOICE: VoiceConfig = { dictation: OFF, speaking: OFF };

function half(raw: unknown): SpeechService {
  const r = (raw ?? {}) as Partial<Record<keyof SpeechService, unknown>>;
  return {
    enabled: r.enabled === true,
    service: typeof r.service === "string" ? r.service : "",
    model: typeof r.model === "string" ? r.model : "",
    apiKey: typeof r.apiKey === "string" ? r.apiKey : "",
  };
}

export function parseVoiceConfig(json: string | null): VoiceConfig {
  if (!json) return DEFAULT_VOICE;
  try {
    const raw = JSON.parse(json) as Partial<Record<keyof VoiceConfig, unknown>>;
    return { dictation: half(raw.dictation), speaking: half(raw.speaking) };
  } catch {
    return DEFAULT_VOICE;
  }
}

interface VoicePrefsStore {
  voice: VoiceConfig;
  setVoice: (next: VoiceConfig) => void;
}

export const useVoicePrefs = create<VoicePrefsStore>((set) => ({
  voice: parseVoiceConfig(readPreference(VOICE_PREFS_KEY, "")),
  setVoice: (voice) => {
    writePreference(VOICE_PREFS_KEY, JSON.stringify(voice));
    set({ voice });
  },
}));
