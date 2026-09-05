/** Talking with an agent: dictation, reading replies aloud, and the loop.
 *
 *  Ported from hermes-app `src/useVoice.ts`. One implementation for every
 *  surface that carries a composer — the docked panel, the ejected panel and
 *  the HUD.
 *
 *  **Conversation sends what it hears.** The agent replies, it is spoken, the
 *  microphone reopens, and the next thing said goes straight out. Outside the
 *  mode a transcript lands in the composer unsent.
 *
 *  **Semi-duplex on purpose.** The microphone is shut for the whole of the
 *  agent's speech and reopens when the audio ends, so an agent can never
 *  transcribe itself. Interrupting is cancel-and-restart.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";

import type { Message } from "@/engine/transcript";
import { startBrowserDictation, type BrowserDictationSession } from "@/services/voice";
import { levelOf, micTrouble, pushLevel, record, sayable, transcribe, type Recorder } from "./dictation";
import { useVoicePrefs } from "./voice-prefs";

export interface VoiceHost {
  /** The Hermes profile this surface addresses; null when there is none. */
  profile: string | null;
  messages: Message[];
  /** True while a turn is running: the loop must wait rather than send into it. */
  sending: boolean;
  /** Send a turn. The loop's own send goes through here like any other. */
  onSend: (text: string) => void;
  /** Where a dictated sentence lands when it is not being sent. */
  onTranscript: (text: string) => void;
  /** How many bars the surface's waveform draws. */
  bars?: number;
}

/** The unspoken agent reply the loop should read next, if any. */
export function nextToSpeak(messages: Message[], spoken: Set<string>): Message | null {
  const last = messages[messages.length - 1];
  if (!last || last.from === "you" || last.streaming || last.failed) return null;
  if (spoken.has(last.id) || !last.text.trim()) return null;
  return last;
}

function reason(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : typeof e === "string" ? e : fallback;
}

export function joinVoiceText(committed: string, live: string) {
  const heard = live.trim();
  // This also renders controlled drafts: idle dictation must leave typing intact.
  return heard ? [committed.trimEnd(), heard].filter(Boolean).join(" ") : committed;
}

export function useVoice({ profile, messages, sending, onSend, onTranscript, bars = 16 }: VoiceHost) {
  const prefs = useVoicePrefs((s) => s.voice);
  const listening = useRef<Recorder | null>(null);
  const browserListening = useRef<BrowserDictationSession | null>(null);
  const browserFinal = useRef("");
  const [mine, setMine] = useState(false);
  const [levels, setLevels] = useState<number[]>([]);
  const [hearing, setHearing] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [interim, setInterim] = useState("");

  const [convo, setConvo] = useState(false);
  const [talking, setTalking] = useState<string | null>(null);
  const [said, setSaid] = useState(0);
  const [saidLevels, setSaidLevels] = useState<number[]>([]);
  const audio = useRef<{ element: HTMLAudioElement; finish: () => void } | null>(null);
  const spoken = useRef<Set<string>>(new Set());
  const speakingId = useRef<string | null>(null);
  const convoRef = useRef(false);
  useEffect(() => {
    convoRef.current = convo;
  }, [convo]);

  // The profile's own voice id, read from its Hermes config. Absent, Rust
  // speaks in Hermes's default narrator, so a profile without one still talks.
  const [voiceId, setVoiceId] = useState<string>("");
  useEffect(() => {
    let live = true;
    setVoiceId("");
    if (!profile) return;
    void invoke<{ service: string; voice_id: string }>("voice_of_profile", { profile })
      .then((v) => live && setVoiceId(v.voice_id))
      .catch(() => live && setVoiceId(""));
    return () => {
      live = false;
    };
  }, [profile]);

  const canConverse = !!profile && prefs.speaking.enabled && prefs.dictation.enabled;
  const why = !profile
    ? "Conversation works with one agent at a time"
    : !prefs.speaking.enabled
      ? "Speaking is switched off in Settings"
      : !prefs.dictation.enabled
        ? "Dictation is switched off in Settings"
        : "";

  const hush = useCallback(() => {
    audio.current?.element.pause();
    audio.current?.finish();
    speakingId.current = null;
    setTalking(null);
    setSaid(0);
    setSaidLevels([]);
  }, []);

  /** Speak one piece of text and wait for it to finish. */
  const say = useCallback(async (text: string) => {
    const path = await invoke<string>("voice_prepare", {
      text: sayable(text),
      voice: voiceId || null,
      model: prefs.speaking.model || null,
    });
    if (!path) return;

    const element = new Audio(convertFileSrc(path));
    let frameId = 0;
    let context: AudioContext | undefined;
    let settled = false;
    let resolveDone: (() => void) | undefined;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.cancelAnimationFrame(frameId);
      void context?.close();
      if (audio.current?.element === element) audio.current = null;
      setSaid(0);
      setSaidLevels([]);
      resolveDone?.();
    };
    audio.current?.element.pause();
    audio.current?.finish();
    audio.current = { element, finish };

    try {
      context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      context.createMediaElementSource(element).connect(analyser);
      analyser.connect(context.destination);
      const samples = new Float32Array(analyser.fftSize);
      const watch = () => {
        analyser.getFloatTimeDomainData(samples);
        const level = levelOf(samples);
        setSaid(level);
        setSaidLevels((levels) => pushLevel(levels, level, bars));
        frameId = window.requestAnimationFrame(watch);
      };
      frameId = window.requestAnimationFrame(watch);
    } catch {
      // Playback still works when an analyser is unavailable; only the
      // measured avatar response is omitted.
    }

    await new Promise<void>((resolve) => {
      resolveDone = resolve;
      element.onended = finish;
      element.onerror = finish;
      void element.play().catch(finish);
    });
  }, [voiceId, prefs.speaking.model, bars]);

  /** Read one reply aloud, on request. Separate from the loop. */
  const readAloud = useCallback(
    async (m: Message) => {
      setNote(null);
      if (!prefs.speaking.enabled) {
        setNote("Reading replies aloud is switched off — turn it on in Settings.");
        return;
      }
      speakingId.current = m.id;
      setTalking(m.id);
      try {
        await say(m.text);
      } catch (e) {
        setNote(reason(e, "That reply could not be read aloud."));
      } finally {
        if (speakingId.current === m.id) {
          speakingId.current = null;
          setTalking(null);
        }
      }
    },
    [prefs.speaking.enabled, say],
  );

  /** Start listening, or stop and use what was said. */
  const dictate = useCallback(async () => {
    if (listening.current) {
      const rec = listening.current;
      listening.current = null;
      const browser = browserListening.current;
      browserListening.current = null;
      browser?.stop();
      setMine(false);
      setLevels([]);
      setHearing(true);
      try {
        const bytes = await rec.stop();
        if (bytes.length === 0) return;
        const heard = (await transcribe(bytes, prefs.dictation.model, prefs.dictation.language)).trim();
        if (!heard) {
          setNote("Nothing was heard in that recording.");
          return;
        }
        if (convoRef.current) onSend(heard);
        else onTranscript(heard);
      } catch (e) {
        setNote(reason(e, "That recording could not be transcribed."));
      } finally {
        setInterim("");
        browserFinal.current = "";
        setHearing(false);
      }
      return;
    }

    if (!prefs.dictation.enabled) {
      setNote("Dictation is switched off — turn it on in Settings.");
      return;
    }
    setNote(null);
    try {
      const rec = await record(
        (v) => setLevels((ls) => pushLevel(ls, v, bars)),
        // In conversation, stopping talking is how you finish a turn.
        convoRef.current ? () => void endTurn.current?.() : undefined,
      );
      listening.current = rec;
      setMine(true);
      browserFinal.current = "";
      setInterim("");
      let browser: BrowserDictationSession | null = null;
      try {
        browser = startBrowserDictation({
          onFinal: (text) => {
            if (browserListening.current !== browser) return;
            browserFinal.current = joinVoiceText(browserFinal.current, text);
            setInterim(browserFinal.current);
          },
          onInterim: (text) => {
            if (browserListening.current === browser) setInterim(joinVoiceText(browserFinal.current, text));
          },
          onEnd: () => {
            if (browserListening.current === browser) browserListening.current = null;
          },
        });
        browserListening.current = browser;
      } catch {
        // Live preview is optional; the selected local model still owns the final transcript.
      }
    } catch (e) {
      setMine(false);
      setNote(micTrouble(e));
    }
  }, [prefs.dictation, onSend, onTranscript, bars]);

  /** Discard a recording in progress without transcribing it. */
  const abandon = useCallback(() => {
    const rec = listening.current;
    if (!rec) return;
    listening.current = null;
    const browser = browserListening.current;
    browserListening.current = null;
    browser?.stop();
    rec.cancel();
    setMine(false);
    setLevels([]);
    setInterim("");
    browserFinal.current = "";
  }, []);

  // `record` captures its silence callback once; this keeps it current.
  const endTurn = useRef<(() => Promise<void>) | null>(null);
  useEffect(() => {
    endTurn.current = dictate;
  }, [dictate]);

  // Entering the mode opens the microphone; leaving it stops whatever was in
  // flight. Replies already in the log are marked spoken rather than read:
  // turning the mode on is not a request to hear the last thing again.
  // Declared before the loop so it runs first on the render that turns on.
  useEffect(() => {
    if (!convo) {
      hush();
      listening.current?.cancel();
      listening.current = null;
      browserListening.current?.stop();
      browserListening.current = null;
      setMine(false);
      setInterim("");
      return;
    }
    for (const m of messages) spoken.current.add(m.id);
    if (!listening.current && !talking && !hearing) void dictate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convo]);

  // The loop: speak a settled reply, then hand the floor back. The reopen
  // lives in the speech's own finally, guarded by `speakingId`, so a reply
  // superseded or hushed does not reopen the microphone on its own account.
  useEffect(() => {
    if (!convo || !profile || talking || listening.current || hearing || sending) return;
    const last = nextToSpeak(messages, spoken.current);
    if (!last) return;
    spoken.current.add(last.id);
    speakingId.current = last.id;
    setTalking(last.id);
    void (async () => {
      try {
        await say(last.text);
      } catch (e) {
        setNote(reason(e, "That reply could not be spoken."));
      } finally {
        setTalking(null);
        if (convoRef.current && speakingId.current === last.id && !listening.current && !hearing) {
          void dictate();
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convo, messages, profile, talking, hearing, sending]);

  // An open microphone must not outlive the surface.
  useEffect(
    () => () => {
      listening.current?.cancel();
      browserListening.current?.stop();
      audio.current?.element.pause();
      audio.current?.finish();
    },
    [],
  );

  /** Stop the agent mid-sentence. In conversation the floor comes straight
   *  back rather than the mode ending. */
  const interrupt = useCallback(() => {
    hush();
    if (convoRef.current) void dictate();
  }, [hush, dictate]);

  return {
    /** True while the microphone is open. */
    mine,
    /** True while a transcript is being made. */
    hearing,
    /** The id of the reply being spoken, or null. */
    talking,
    /** Measured playback amplitude for the speaking agent avatar. */
    said,
    /** Rolling measured playback levels for the speaking waveform. */
    saidLevels,
    /** Live microphone levels for a waveform. */
    levels,
    /** Whatever went wrong, in a sentence. */
    note,
    /** Live browser recognition shown while the local final transcript is pending. */
    interim,
    setNote,
    convo,
    setConvo,
    canConverse,
    why,
    dictationOn: prefs.dictation.enabled,
    dictate,
    abandon,
    readAloud,
    interrupt,
  };
}

export type VoiceHandle = ReturnType<typeof useVoice>;
