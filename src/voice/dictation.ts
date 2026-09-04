/** Recording the user's voice, and turning it into text.
 *
 *  Ported from hermes-app `src/dictation.ts`. The half of voice that listens;
 *  speaking is the other half and they share nothing but a settings page.
 *
 *  **The transcript never sends itself** outside conversation mode. It lands
 *  in the composer, unsent: the difference between a typo and a dispatched
 *  instruction is the whole point of the rule.
 */

import { invoke } from "@tauri-apps/api/core";

/** What a microphone refused, in a sentence a person can act on. */
export function micTrouble(e: unknown): string {
  const name = e instanceof DOMException ? e.name : "";
  switch (name) {
    case "NotAllowedError":
      return "Microphone access was refused — allow it in System Settings → Privacy & Security → Microphone.";
    case "NotFoundError":
      return "No microphone was found on this machine.";
    case "NotReadableError":
      return "The microphone is in use by another app.";
    case "SecurityError":
      return "The microphone is blocked in this window.";
    default:
      return e instanceof Error && e.message
        ? `The microphone could not start: ${e.message}`
        : "The microphone could not start.";
  }
}

/** One bar height, 0..1, from a frame of PCM. RMS rather than peak, with a
 *  frame whose energy sits almost all in one sample (a click, a key press)
 *  discounted so the meter answers the person and not the keyboard. */
export function levelOf(frame: Float32Array): number {
  if (frame.length === 0) return 0;
  let sum = 0;
  let peak = 0;
  for (let i = 0; i < frame.length; i += 1) {
    const v = frame[i] * frame[i];
    sum += v;
    if (v > peak) peak = v;
  }
  const rms = Math.sqrt(sum / frame.length);
  const share = sum > 0 ? peak / sum : 0;
  const impulsive = Math.max(0, share - 0.5) * 2;
  return Math.min(1, rms * 13 * (1 - 0.85 * impulsive));
}

/** The rolling window of bars a waveform draws, newest last. */
export function pushLevel(levels: number[], next: number, bars: number): number[] {
  const out = levels.length >= bars ? levels.slice(levels.length - bars + 1) : levels.slice();
  out.push(next);
  return out;
}

/** A recording in progress, and how to end it. */
export interface Recorder {
  /** Stop, and resolve with the recorded audio. Empty if nothing was captured. */
  stop: () => Promise<Uint8Array>;
  /** Abandon the recording and release the microphone. */
  cancel: () => void;
}

/** How quiet counts as quiet, and for how long. Slower than a realtime VAD
 *  on purpose: a pause for breath mid-sentence must not dispatch half of it. */
const QUIET = 0.08;
const QUIET_MS = 1400;

/** Open the microphone and start recording, reporting levels as it goes. */
export async function record(
  onLevel: (v: number) => void,
  /** Called when the speaker has stopped for `QUIET_MS`. Absent, the
   *  recording runs until something stops it. */
  onSilence?: () => void,
): Promise<Recorder> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });

  const audio = new AudioContext();
  const analyser = audio.createAnalyser();
  analyser.fftSize = 512;
  audio.createMediaStreamSource(stream).connect(analyser);
  const frame = new Float32Array(analyser.fftSize);

  let raf = 0;
  // Silence only counts once something has been said.
  let spoke = false;
  let quietSince = 0;
  let ended = false;
  const meter = () => {
    analyser.getFloatTimeDomainData(frame);
    const level = levelOf(frame);
    onLevel(level);
    if (onSilence && !ended) {
      const now = performance.now();
      if (level > QUIET) {
        spoke = true;
        quietSince = now;
      } else if (spoke && quietSince && now - quietSince > QUIET_MS) {
        ended = true;
        onSilence();
      } else if (spoke && !quietSince) {
        quietSince = now;
      }
    }
    raf = requestAnimationFrame(meter);
  };
  raf = requestAnimationFrame(meter);

  const chunks: BlobPart[] = [];
  let rec: MediaRecorder;
  try {
    rec = new MediaRecorder(stream);
  } catch (e) {
    cancelAnimationFrame(raf);
    stream.getTracks().forEach((t) => t.stop());
    void audio.close();
    throw e;
  }
  rec.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  rec.start();

  const release = () => {
    cancelAnimationFrame(raf);
    stream.getTracks().forEach((t) => t.stop());
    void audio.close();
  };

  // One stop, however many times it is asked for: a second `rec.stop()`
  // throws and would orphan the first promise.
  let ending: Promise<Uint8Array> | null = null;

  return {
    stop: () =>
      (ending ??= new Promise<Uint8Array>((resolve) => {
        // Whatever the cause, the bytes arrive or the wait ends.
        const done = (b: Uint8Array) => {
          clearTimeout(guard);
          release();
          resolve(b);
        };
        const guard = setTimeout(() => done(new Uint8Array()), 4000);
        const flush = () =>
          void new Blob(chunks)
            .arrayBuffer()
            .then((b) => done(new Uint8Array(b)))
            .catch(() => done(new Uint8Array()));
        rec.onstop = flush;
        if (rec.state === "inactive") flush();
        else rec.stop();
      })),
    cancel: () => {
      if (ending) return;
      rec.onstop = null;
      if (rec.state !== "inactive") rec.stop();
      release();
    },
  };
}

/** Recorded audio to text, through the local engine chosen in Settings. */
export function transcribe(bytes: Uint8Array, model: string, language: string): Promise<string> {
  return invoke<string>("voice_transcribe", { bytes: Array.from(bytes), model, language });
}

/** As much of a reply as is worth reading out, ending on a sentence. A long
 *  answer read aloud holds the floor for minutes; the cut lands on the last
 *  sentence that fits and the whole reply stays on screen to read. */
export function sayable(text: string, cap = 1200): string {
  const clean = text.trim();
  if (clean.length <= cap) return clean;
  const head = clean.slice(0, cap);
  const stop = Math.max(head.lastIndexOf(". "), head.lastIndexOf("? "), head.lastIndexOf("! "));
  if (stop > cap / 2) return head.slice(0, stop + 1);
  const space = head.lastIndexOf(" ");
  return (space > cap / 2 ? head.slice(0, space) : head).trimEnd() + "…";
}
