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
      configured: Boolean(hermesVoiceUrl),
      canTranscribe: Boolean(hermesVoiceUrl) && hasBrowserAudioCapture(),
      canSpeak: Boolean(hermesVoiceUrl),
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

export async function transcribeWithHermes(audio: Blob) {
  if (!hermesVoiceUrl) throw new Error("Hermes voice URL is not configured.");

  const dataUrl = await blobToDataUrl(audio);
  const res = await fetch(`${hermesVoiceUrl}/api/audio/transcribe`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
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
  if (!hermesVoiceUrl) throw new Error("Hermes voice URL is not configured.");

  const res = await fetch(`${hermesVoiceUrl}/api/audio/speak`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
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
