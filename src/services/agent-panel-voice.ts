import {
  speakWithHermes,
  supportsBrowserSpeechSynthesis,
  transcribeWithHermes,
  type VoiceProviderId,
} from "@/services/voice";

export function joinVoiceDraft(base: string, addition: string) {
  const normalized = addition.trim();
  return `${base}${base && normalized ? " " : ""}${normalized}`;
}

export async function transcribeVoiceDraft(
  audio: Blob,
  base: string,
  transcribe: typeof transcribeWithHermes = transcribeWithHermes,
) {
  const result = await transcribe(audio);
  return {
    transcript: result.transcript,
    draft: result.transcript ? joinVoiceDraft(base, result.transcript) : base,
  };
}

export class AgentPanelVoicePlayback {
  private generation = 0;
  private audio: HTMLAudioElement | null = null;
  private complete: (() => void) | null = null;

  constructor(private readonly setSpeaking: (speaking: boolean) => void) {}

  stop() {
    this.generation += 1;
    this.audio?.pause();
    this.audio = null;
    this.complete?.();
    this.complete = null;
    if (supportsBrowserSpeechSynthesis()) window.speechSynthesis.cancel();
    this.setSpeaking(false);
  }

  async speak(text: string, providerId: VoiceProviderId) {
    const generation = ++this.generation;
    if (providerId === "hermes") {
      const result = await speakWithHermes(text);
      if (generation !== this.generation) return;
      const audio = new Audio(result.dataUrl);
      this.audio = audio;
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          if (this.complete === finish) this.complete = null;
          this.audio = null;
          this.setSpeaking(false);
          resolve();
        };
        const fail = (error: Error) => {
          if (settled) return;
          settled = true;
          if (this.complete === finish) this.complete = null;
          this.audio = null;
          this.setSpeaking(false);
          reject(error);
        };
        this.complete = finish;
        audio.onended = finish;
        audio.onerror = () =>
          fail(new Error("The generated audio could not be played."));
        void audio
          .play()
          .catch((error) =>
            fail(
              error instanceof Error
                ? error
                : new Error("The generated audio could not be played."),
            ),
          );
      });
      return;
    }

    if (!supportsBrowserSpeechSynthesis()) {
      throw new Error("Speech output unavailable.");
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.94;
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (this.complete === finish) this.complete = null;
        this.setSpeaking(false);
        resolve();
      };
      this.complete = finish;
      utterance.onend = finish;
      utterance.onerror = (event) => {
        if (settled) return;
        settled = true;
        if (this.complete === finish) this.complete = null;
        this.setSpeaking(false);
        reject(
          new Error(
            event.error || "Speech synthesis stopped unexpectedly.",
          ),
        );
      };
      window.speechSynthesis.cancel();
      if (generation !== this.generation) {
        finish();
        return;
      }
      window.speechSynthesis.speak(utterance);
    });
  }
}
