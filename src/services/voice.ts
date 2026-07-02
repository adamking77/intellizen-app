import { isTauri } from "@tauri-apps/api/core";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

export type VoiceProviderId = "hermes" | "browser";

export interface VoiceProviderStatus {
  id: VoiceProviderId;
  label: string;
  configured: boolean;
  canTranscribe: boolean;
  canSpeak: boolean;
}

interface HermesTranscriptionResponse {
  ok?: boolean;
  transcript?: string;
  provider?: string;
}

interface HermesSpeechResponse {
  ok?: boolean;
  data_url?: string;
  mime_type?: string;
  provider?: string;
}

const hermesVoiceUrl =
  import.meta.env.VITE_HERMES_VOICE_URL?.replace(/\/$/, "") || null;

// ── Hermes dashboard transport ─────────────────────────────────────────────
// The dashboard (voice + profile catalog) has no CORS and gates /api behind
// a per-boot session token embedded in its SPA HTML. Two transports:
// - Tauri (dev app + packaged DMG): tauri-plugin-http, which is not subject
//   to CORS — scrape the token from the SPA, retry once on 401. The vite
//   proxy does not exist in a packaged app.
// - Plain browser (QA): the /hermes-dash vite dev middleware, which scrapes
//   the token server-side.

const HERMES_DASHBOARD_DIRECT = "http://127.0.0.1:9119";

let dashboardSessionToken: string | null = null;

async function scrapeDashboardToken() {
  try {
    const res = await tauriFetch(`${HERMES_DASHBOARD_DIRECT}/`);
    const html = await res.text();
    dashboardSessionToken = /SESSION_TOKEN__\s*=\s*"([^"]+)"/.exec(html)?.[1] ?? null;
  } catch {
    dashboardSessionToken = null;
  }
  return dashboardSessionToken;
}

export function hermesDashboardConfigured() {
  return isTauri() || Boolean(hermesVoiceUrl);
}

export async function hermesDashboardFetch(
  path: string,
  init?: { method?: string; body?: string },
): Promise<Response> {
  if (isTauri()) {
    const attempt = (token: string | null) =>
      tauriFetch(`${HERMES_DASHBOARD_DIRECT}${path}`, {
        method: init?.method ?? "GET",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "X-Hermes-Session-Token": token } : {}),
        },
        body: init?.body,
      });
    let res = await attempt(dashboardSessionToken ?? (await scrapeDashboardToken()));
    if (res.status === 401) res = await attempt(await scrapeDashboardToken());
    return res;
  }

  if (!hermesVoiceUrl) throw new Error("Hermes voice URL is not configured.");
  return fetch(`${hermesVoiceUrl}${path}`, {
    method: init?.method ?? "GET",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: init?.body,
  });
}

function hasBrowserSpeechRecognition() {
  if (typeof window === "undefined") return false;
  return "SpeechRecognition" in window || "webkitSpeechRecognition" in window;
}

function hasBrowserSpeechSynthesis() {
  return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

function hasBrowserAudioCapture() {
  return typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== "undefined";
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Could not encode audio recording."));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read audio recording."));
    reader.readAsDataURL(blob);
  });
}

async function parseHermesError(res: Response) {
  const text = await res.text().catch(() => "");
  if (!text) return res.statusText;

  try {
    const payload = JSON.parse(text) as { detail?: unknown; error?: unknown };
    const detail = payload.detail ?? payload.error;
    if (typeof detail === "string") return detail;
  } catch {
    /* use raw text */
  }

  return text;
}

export function getVoiceProviderStatus(): VoiceProviderStatus[] {
  return [
    {
      id: "hermes",
      label: "Hermes voice",
      configured: hermesDashboardConfigured(),
      canTranscribe: hermesDashboardConfigured() && hasBrowserAudioCapture(),
      canSpeak: hermesDashboardConfigured(),
    },
    {
      id: "browser",
      label: "Browser speech",
      configured: true,
      canTranscribe: hasBrowserSpeechRecognition(),
      canSpeak: hasBrowserSpeechSynthesis(),
    },
  ];
}

export function getPreferredVoiceProvider() {
  const providers = getVoiceProviderStatus();
  return providers.find((provider) => provider.id === "hermes" && (provider.canTranscribe || provider.canSpeak)) ??
    providers.find((provider) => provider.id === "browser")!;
}

export function getPreferredVoiceInputProvider() {
  const providers = getVoiceProviderStatus();
  return providers.find((provider) => provider.id === "hermes" && provider.canTranscribe) ??
    providers.find((provider) => provider.id === "browser" && provider.canTranscribe) ??
    null;
}

export function getPreferredVoiceOutputProvider() {
  const providers = getVoiceProviderStatus();
  return providers.find((provider) => provider.id === "hermes" && provider.canSpeak) ??
    providers.find((provider) => provider.id === "browser" && provider.canSpeak) ??
    null;
}

// ── Browser dictation ──────────────────────────────────────────────────────
// SpeechRecognition wrapper so UI components never touch the vendor API or
// splice interim text into their drafts: final and interim text arrive on
// separate callbacks.

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface VoiceWindow extends Window {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}

function getSpeechRecognitionConstructor() {
  if (typeof window === "undefined") return null;
  const voiceWindow = window as VoiceWindow;
  return voiceWindow.SpeechRecognition ?? voiceWindow.webkitSpeechRecognition ?? null;
}

export interface BrowserDictationHandlers {
  onFinal: (text: string) => void;
  onInterim?: (text: string) => void;
  onError?: (message: string) => void;
  onEnd?: () => void;
}

export interface BrowserDictationSession {
  stop: () => void;
}

export function startBrowserDictation(handlers: BrowserDictationHandlers): BrowserDictationSession | null {
  const Recognition = getSpeechRecognitionConstructor();
  if (!Recognition) return null;

  const recognition = new Recognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";
  recognition.onresult = (event) => {
    let finalText = "";
    let interimText = "";
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      if (result.isFinal) finalText += result[0].transcript;
      else interimText += result[0].transcript;
    }
    if (finalText.trim()) handlers.onFinal(finalText.trim());
    handlers.onInterim?.(interimText.trim());
  };
  recognition.onerror = (event) => {
    handlers.onError?.(event.error ?? "Recognition error");
  };
  recognition.onend = () => {
    handlers.onInterim?.("");
    handlers.onEnd?.();
  };
  recognition.start();
  return { stop: () => recognition.stop() };
}

export function supportsBrowserSpeechSynthesis() {
  return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

export async function transcribeWithHermes(audio: Blob) {
  const dataUrl = await blobToDataUrl(audio);
  const res = await hermesDashboardFetch("/api/audio/transcribe", {
    method: "POST",
    body: JSON.stringify({
      data_url: dataUrl,
      mime_type: audio.type || "audio/webm",
    }),
  });

  if (!res.ok) {
    throw new Error(`Hermes transcription failed (${res.status}): ${await parseHermesError(res)}`);
  }

  const payload = await res.json() as HermesTranscriptionResponse;
  if (!payload.ok) throw new Error("Hermes transcription failed.");
  return {
    transcript: (payload.transcript ?? "").trim(),
    provider: payload.provider ?? "hermes",
  };
}

export async function speakWithHermes(text: string) {
  const res = await hermesDashboardFetch("/api/audio/speak", {
    method: "POST",
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    throw new Error(`Hermes speech failed (${res.status}): ${await parseHermesError(res)}`);
  }

  const payload = await res.json() as HermesSpeechResponse;
  if (!payload.ok || !payload.data_url) throw new Error("Hermes speech failed.");
  return {
    dataUrl: payload.data_url,
    mimeType: payload.mime_type ?? "audio/mpeg",
    provider: payload.provider ?? "hermes",
  };
}
