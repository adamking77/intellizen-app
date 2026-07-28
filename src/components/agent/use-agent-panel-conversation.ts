import {
  useEffect,
  useReducer,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";

import {
  formatChatTextAttachment,
  MAX_CHAT_TEXT_FILE_BYTES,
  MAX_CHAT_TEXT_FILES,
  supportsChatTextFile,
} from "@/lib/chat-attachments";
import {
  buildSteeredAgentPanelHistory,
} from "@/lib/agent-panel-chat";
import {
  appendToAgentPanelDraft,
  LOCAL_CHAT_HISTORY_LIMIT,
  type AgentChatEntry,
  type ChatTurn,
} from "@/lib/agent-panel-persistence";
import type { AgentPanelRoleTarget } from "@/lib/agent-panel-roles";
import type { ConversationContextSnapshot } from "@/lib/conversation-context";
import {
  INITIAL_LIVE_VOICE_STATE,
  liveVoiceReducer,
} from "@/lib/live-voice-session";
import { toast, toastError } from "@/lib/toast";
import { sendAgentPanelChatMessage } from "@/services/agent-panel-chat";
import {
  AgentPanelVoicePlayback,
  joinVoiceDraft,
  transcribeVoiceDraft,
} from "@/services/agent-panel-voice";
import {
  startBrowserDictation,
  transcribeWithHermes,
  type BrowserDictationSession,
  type VoiceProviderStatus,
} from "@/services/voice";

interface UseAgentPanelConversationInput {
  selectedRoleKey: string | null;
  selectedRole: AgentPanelRoleTarget | null;
  targetAgent: string;
  chatDraft: string;
  setChatDraft: Dispatch<SetStateAction<string>>;
  setChatEntries: Dispatch<SetStateAction<AgentChatEntry[]>>;
  chatTurns: ChatTurn[];
  conversationContext: ConversationContextSnapshot | null;
  fionaSelected: boolean;
  fionaDirectLive: boolean;
  targetProfileName: string | null;
  voiceProviders: VoiceProviderStatus[];
  voiceInputProvider: VoiceProviderStatus | null;
  voiceOutputProvider: VoiceProviderStatus | null;
  liveVoiceAvailable: boolean;
  liveVoiceUnavailableReason: string | null;
  speakReplies: boolean;
  notifyWorkspaceMayHaveChanged: () => void;
}

interface SendChatOptions {
  historyOverride?: Array<{ role: "user" | "assistant"; content: string }>;
  preserveDraft?: boolean;
  steering?: boolean;
  liveVoice?: boolean;
}

export interface AgentPanelConversationCoordinator {
  composerRef: RefObject<HTMLTextAreaElement>;
  interimTranscript: string;
  isListening: boolean;
  isSendingChat: boolean;
  isSpeaking: boolean;
  liveVoice: ReturnType<typeof liveVoiceReducer>;
  streamingReply: string | null;
  addTextAttachments: (files: File[]) => Promise<void>;
  cancelActiveConversation: () => void;
  endLiveVoiceSession: () => void;
  interruptLiveVoice: () => void;
  retryMessage: (
    message: string,
    history: Array<{ role: "user" | "assistant"; content: string }>,
  ) => void;
  startLiveVoiceSession: () => void;
  startVoiceDraft: () => void;
  stopActiveResponse: () => void;
  stopSpeaking: () => void;
  submitComposer: () => void;
  submitLiveVoiceTurn: () => void;
  toggleLiveVoiceMute: () => void;
}

export function useAgentPanelConversation(
  input: UseAgentPanelConversationInput,
): AgentPanelConversationCoordinator {
  const {
    selectedRole,
    selectedRoleKey,
    targetAgent,
    chatDraft,
    setChatDraft,
    setChatEntries,
    chatTurns,
    conversationContext,
    fionaSelected,
    fionaDirectLive,
    targetProfileName,
    voiceProviders,
    voiceInputProvider,
    voiceOutputProvider,
    liveVoiceAvailable,
    liveVoiceUnavailableReason,
    speakReplies,
    notifyWorkspaceMayHaveChanged,
  } = input;
  const [interimTranscript, setInterimTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [streamingReply, setStreamingReply] = useState<string | null>(null);
  const [liveVoice, dispatchLiveVoice] = useReducer(
    liveVoiceReducer,
    INITIAL_LIVE_VOICE_STATE,
  );
  const mountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const pendingSteerRef = useRef<string | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const dictationRef = useRef<BrowserDictationSession | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const hermesPreviewBusyRef = useRef(false);
  const hermesPreviewDirtyRef = useRef(false);
  const hermesPreviewErrorShownRef = useRef(false);
  const dictationBaseDraftRef = useRef("");
  const liveVoiceDictationRef = useRef<BrowserDictationSession | null>(null);
  const liveVoiceRecorderRef = useRef<MediaRecorder | null>(null);
  const liveVoiceStreamRef = useRef<MediaStream | null>(null);
  const liveVoiceTranscriptRef = useRef("");
  const liveVoiceInterimRef = useRef("");
  const liveVoiceSubmitPendingRef = useRef(false);
  const liveVoiceShouldListenRef = useRef(false);
  const liveVoiceEpochRef = useRef(0);
  const liveVoiceStateRef = useRef(liveVoice);
  const voicePlaybackRef = useRef<AgentPanelVoicePlayback | null>(null);
  if (!voicePlaybackRef.current) {
    voicePlaybackRef.current = new AgentPanelVoicePlayback(setIsSpeaking);
  }

  useEffect(() => {
    liveVoiceStateRef.current = liveVoice;
  }, [liveVoice]);

  const previousRoleKeyRef = useRef(selectedRoleKey);
  useEffect(() => {
    if (previousRoleKeyRef.current === selectedRoleKey) return;
    previousRoleKeyRef.current = selectedRoleKey;
    cancelActiveConversation();
  }, [selectedRoleKey]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      pendingSteerRef.current = null;
      abortRef.current?.abort();
      abortRef.current = null;
      liveVoiceEpochRef.current += 1;
      dictationRef.current?.stop();
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      liveVoiceDictationRef.current?.stop();
      if (liveVoiceRecorderRef.current?.state === "recording") {
        liveVoiceRecorderRef.current.stop();
      }
      liveVoiceStreamRef.current?.getTracks().forEach((track) => track.stop());
      voicePlaybackRef.current?.stop();
    };
  }, []);

  function cancelActiveConversation() {
    pendingSteerRef.current = null;
    abortRef.current?.abort();
    abortRef.current = null;
    setStreamingReply(null);
    setIsSendingChat(false);
  }

  function stopSpeaking() {
    voicePlaybackRef.current?.stop();
  }

  function speakWithProvider(text: string, providerId: VoiceProviderStatus["id"]) {
    return voicePlaybackRef.current!.speak(text, providerId);
  }

  async function sendChatMessage(
    messageOverride?: string,
    options: SendChatOptions = {},
  ) {
    const message = (messageOverride ?? chatDraft).trim();
    if (
      !message ||
      !selectedRole ||
      selectedRole.state !== "ready" ||
      !targetAgent ||
      (isSendingChat && !options.steering)
    ) {
      return;
    }
    if (options.liveVoice && !fionaSelected) {
      dispatchLiveVoice({
        type: "FAIL",
        message: "Live voice is Fiona/Hermes-only in this release.",
      });
      return;
    }
    if (options.liveVoice && !fionaDirectLive) {
      dispatchLiveVoice({
        type: "FAIL",
        message:
          "Fiona's live streaming connection is unavailable. Voice turns are not queued.",
      });
      return;
    }

    const liveVoiceTurnEpoch = options.liveVoice
      ? liveVoiceEpochRef.current
      : null;
    const entryId = `panel-${Date.now()}`;
    const sentAt = new Date().toISOString();
    const sentContext = conversationContext;
    const requestHistory =
      options.historyOverride ??
      chatTurns
        .filter((turn) => Boolean(turn.text))
        .slice(-12)
        .map((turn) => ({
          role:
            turn.role === "user"
              ? ("user" as const)
              : ("assistant" as const),
          content: turn.text ?? "",
        }));
    const controller = new AbortController();
    abortRef.current = controller;
    let accumulated = "";
    let completedLiveVoiceTurn = false;
    const optimisticStatus = fionaSelected && !fionaDirectLive
      ? ("queued" as const)
      : ("submitted" as const);

    if (!options.preserveDraft) setChatDraft("");
    setIsSendingChat(true);
    setStreamingReply("");
    setChatEntries((current) =>
      [
        {
          id: entryId,
          message,
          targetAgent,
          status: optimisticStatus,
          detail:
            fionaSelected && !fionaDirectLive
              ? "durable inbox"
              : selectedRole.adapterId ?? "runtime",
          createdAt: sentAt,
          context: sentContext,
        },
        ...current,
      ].slice(0, LOCAL_CHAT_HISTORY_LIMIT),
    );

    try {
      const result = await sendAgentPanelChatMessage({
        role: selectedRole,
        targetAgent,
        history: requestHistory,
        message,
        context: sentContext,
        fionaSelected,
        fionaDirectLive,
        targetProfileName,
        signal: controller.signal,
        onDelta: (delta) => {
          if (!mountedRef.current) return;
          accumulated += delta;
          setStreamingReply((current) => (current ?? "") + delta);
        },
        voiceInputProviderId: voiceInputProvider?.id ?? null,
        voiceOutputProviderId: voiceOutputProvider?.id ?? null,
        voiceProviders,
      });
      if (!mountedRef.current) return;

      if (result.kind === "queued") {
        const receipt = result.messageId ?? result.inboxItemId;
        setChatEntries((current) =>
          current.map((entry) =>
            entry.id === entryId
              ? {
                  ...entry,
                  status: result.status,
                  detail: receipt ?? result.status,
                }
              : entry,
          ),
        );
        toast.success(
          result.status === "submitted"
            ? "Message sent to Fiona"
            : "Message queued for Fiona",
          { description: receipt ?? undefined },
        );
      } else {
        const reply = result.text || accumulated;
        setChatEntries((current) =>
          current.map((entry) =>
            entry.id === entryId
              ? {
                  ...entry,
                  reply: reply || null,
                  widget: result.widgets[0] ?? null,
                  widgets: result.widgets,
                  repliedAt: new Date().toISOString(),
                  detail: result.usage
                    ? `${selectedRole.adapterId} · ${
                        result.usage.inputTokens + result.usage.outputTokens
                      } tokens`
                    : result.provider,
                }
              : entry,
          ),
        );
        if (result.provider === "hermes") notifyWorkspaceMayHaveChanged();

        if (options.liveVoice) {
          if (!reply || !voiceOutputProvider) {
            dispatchLiveVoice({
              type: "FAIL",
              message: "Fiona returned no speakable reply.",
            });
          } else {
            dispatchLiveVoice({ type: "SPEAKING" });
            setIsSpeaking(true);
            try {
              await speakWithProvider(reply, voiceOutputProvider.id);
              completedLiveVoiceTurn =
                liveVoiceTurnEpoch === liveVoiceEpochRef.current;
            } catch (voiceError) {
              if (!mountedRef.current) return;
              setIsSpeaking(false);
              if (liveVoiceTurnEpoch === liveVoiceEpochRef.current) {
                dispatchLiveVoice({
                  type: "FAIL",
                  message:
                    voiceError instanceof Error
                      ? voiceError.message
                      : "Fiona's speech output failed.",
                });
                toastError("Voice output failed", voiceError);
              }
            }
          }
        } else if (speakReplies && reply && voiceOutputProvider) {
          setIsSpeaking(true);
          void speakWithProvider(reply, voiceOutputProvider.id).catch(
            (voiceError) => {
              if (!mountedRef.current) return;
              setIsSpeaking(false);
              toastError("Voice output failed", voiceError);
            },
          );
        }
      }
    } catch (sendError) {
      if (!mountedRef.current) return;
      const stopped =
        sendError instanceof DOMException && sendError.name === "AbortError";
      setChatEntries((current) =>
        current.map((entry) =>
          entry.id === entryId
            ? stopped
              ? {
                  ...entry,
                  status: "cancelled",
                  reply: accumulated || null,
                  repliedAt: new Date().toISOString(),
                  detail: "Stopped by user",
                }
              : {
                  ...entry,
                  status: "failed",
                  detail:
                    sendError instanceof Error
                      ? sendError.message
                      : "Runtime failed",
                }
            : entry,
        ),
      );
      if (!stopped) {
        if (options.liveVoice) {
          dispatchLiveVoice({
            type: "FAIL",
            message:
              sendError instanceof Error
                ? sendError.message
                : "Fiona's voice reply failed.",
          });
        }
        toastError(`${selectedRole.roleName} chat failed`, sendError);
      }
    } finally {
      if (!mountedRef.current) return;
      const pendingSteer = pendingSteerRef.current;
      pendingSteerRef.current = null;
      if (abortRef.current === controller) abortRef.current = null;
      setStreamingReply(null);
      setIsSendingChat(false);

      if (options.liveVoice) {
        if (completedLiveVoiceTurn) {
          dispatchLiveVoice({ type: "TURN_COMPLETE" });
          if (liveVoiceShouldListenRef.current) {
            const epoch = liveVoiceEpochRef.current;
            queueMicrotask(() => void startLiveVoiceListening(epoch));
          }
        }
      } else if (pendingSteer) {
        queueMicrotask(() =>
          void sendChatMessage(pendingSteer, {
            historyOverride: buildSteeredAgentPanelHistory(
              requestHistory,
              message,
              accumulated,
            ),
            preserveDraft: true,
            steering: true,
          }),
        );
      } else {
        queueMicrotask(() => composerRef.current?.focus());
      }
    }
  }

  function submitComposer() {
    const message = chatDraft.trim();
    if (!message) return;
    if (isSendingChat && streamingReply !== null) {
      pendingSteerRef.current = message;
      setChatDraft("");
      abortRef.current?.abort();
      toast.info(
        `Steering ${
          selectedRole?.agentName ?? selectedRole?.roleName ?? "the agent"
        } with your update`,
      );
      return;
    }
    void sendChatMessage();
  }

  function stopActiveResponse() {
    pendingSteerRef.current = null;
    abortRef.current?.abort();
  }

  function retryMessage(
    message: string,
    history: Array<{ role: "user" | "assistant"; content: string }>,
  ) {
    void sendChatMessage(message, {
      historyOverride: history,
      preserveDraft: true,
    });
  }

  async function addTextAttachments(files: File[]) {
    const selected = files.slice(0, MAX_CHAT_TEXT_FILES);
    if (files.length > MAX_CHAT_TEXT_FILES) {
      toast.info(`Only the first ${MAX_CHAT_TEXT_FILES} text files were added.`);
    }

    const formatted: string[] = [];
    for (const file of selected) {
      if (!supportsChatTextFile(file)) {
        toast.error(
          file.type.startsWith("image/")
            ? "Image attachments are not supported yet"
            : "File type not supported",
          {
            description: `${file.name} cannot be sent through the current Hermes text transport.`,
          },
        );
        continue;
      }
      if (file.size > MAX_CHAT_TEXT_FILE_BYTES) {
        toast.error("Text file is too large", {
          description: `${file.name} must be smaller than ${Math.round(
            MAX_CHAT_TEXT_FILE_BYTES / 1000,
          )} KB.`,
        });
        continue;
      }
      try {
        formatted.push(formatChatTextAttachment(file.name, await file.text()));
      } catch (fileError) {
        toastError(`Could not read ${file.name}`, fileError);
      }
    }

    if (formatted.length > 0) {
      setChatDraft((current) =>
        formatted.reduce(appendToAgentPanelDraft, current),
      );
      toast.success(
        formatted.length === 1
          ? "Text file added"
          : `${formatted.length} text files added`,
      );
      queueMicrotask(() => composerRef.current?.focus());
    }
  }

  function appendVoiceDraft(text: string) {
    const normalized = text.trim();
    if (!normalized) return;
    setChatDraft(
      (current) =>
        `${current.trim()}${current.trim() ? " " : ""}${normalized}`,
    );
  }

  async function transcribeHermesRecording(audio: Blob) {
    const base = dictationBaseDraftRef.current;
    try {
      const result = await transcribeVoiceDraft(audio, base);
      if (!result.transcript) {
        setChatDraft(base);
        toast.error("No speech detected");
        return;
      }
      setChatDraft(result.draft);
    } catch (transcribeError) {
      setChatDraft(base);
      toastError("Hermes transcription failed", transcribeError);
    }
  }

  async function previewHermesTranscript(mimeType: string) {
    if (hermesPreviewBusyRef.current) {
      hermesPreviewDirtyRef.current = true;
      return;
    }
    hermesPreviewBusyRef.current = true;
    try {
      do {
        hermesPreviewDirtyRef.current = false;
        const audio = new Blob(recordedChunksRef.current, { type: mimeType });
        if (audio.size === 0) return;
        let result: Awaited<ReturnType<typeof transcribeWithHermes>>;
        try {
          result = await transcribeWithHermes(audio);
        } catch (previewError) {
          if (!hermesPreviewErrorShownRef.current) {
            hermesPreviewErrorShownRef.current = true;
            toastError("Live dictation preview failed", previewError);
          }
          return;
        }
        if (recorderRef.current?.state !== "recording") return;
        if (result?.transcript) {
          setChatDraft(
            joinVoiceDraft(
              dictationBaseDraftRef.current,
              result.transcript,
            ),
          );
        }
      } while (
        hermesPreviewDirtyRef.current &&
        recorderRef.current?.state === "recording"
      );
    } finally {
      hermesPreviewBusyRef.current = false;
    }
  }

  async function startHermesVoiceDraft() {
    if (isListening) {
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.stop();
      }
      setIsListening(false);
      return;
    }

    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      toast.error("Audio recording unavailable");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordedChunksRef.current = [];
      hermesPreviewErrorShownRef.current = false;
      dictationBaseDraftRef.current = chatDraft.trim();
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
          if (recorder.state === "recording") {
            void previewHermesTranscript(recorder.mimeType || "audio/webm");
          }
        }
      };
      recorder.onerror = () => {
        setIsListening(false);
        toast.error("Audio recording stopped");
        stream.getTracks().forEach((track) => track.stop());
      };
      recorder.onstop = () => {
        setIsListening(false);
        stream.getTracks().forEach((track) => track.stop());
        const audio = new Blob(recordedChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        recordedChunksRef.current = [];
        if (audio.size > 0) void transcribeHermesRecording(audio);
      };
      recorderRef.current = recorder;
      recorder.start(2000);
      setIsListening(true);
    } catch (recordError) {
      setIsListening(false);
      toastError("Microphone unavailable", recordError);
    }
  }

  function startBrowserVoiceDraft() {
    if (isListening) {
      dictationRef.current?.stop();
      setIsListening(false);
      setInterimTranscript("");
      return;
    }
    const session = startBrowserDictation({
      onFinal: appendVoiceDraft,
      onInterim: setInterimTranscript,
      onError: (message) => {
        setIsListening(false);
        setInterimTranscript("");
        toast.error("Speech recognition stopped", { description: message });
      },
      onEnd: () => {
        setIsListening(false);
        setInterimTranscript("");
      },
    });
    if (!session) {
      toast.error("Speech recognition unavailable");
      return;
    }
    dictationRef.current = session;
    setIsListening(true);
  }

  function startVoiceDraft() {
    if (voiceInputProvider?.id === "hermes") {
      void startHermesVoiceDraft();
      return;
    }
    startBrowserVoiceDraft();
  }

  function stopLiveVoiceCapture() {
    liveVoiceDictationRef.current?.stop();
    liveVoiceDictationRef.current = null;
    const recorder = liveVoiceRecorderRef.current;
    if (recorder?.state === "recording") recorder.stop();
    else {
      liveVoiceStreamRef.current?.getTracks().forEach((track) => track.stop());
    }
    liveVoiceRecorderRef.current = null;
    liveVoiceStreamRef.current = null;
  }

  function resetLiveVoiceTranscript() {
    liveVoiceTranscriptRef.current = "";
    liveVoiceInterimRef.current = "";
  }

  function failLiveVoice(message: string) {
    liveVoiceShouldListenRef.current = false;
    liveVoiceSubmitPendingRef.current = false;
    stopLiveVoiceCapture();
    dispatchLiveVoice({ type: "FAIL", message });
  }

  function sendLiveVoiceTranscript(transcript: string) {
    const normalized = transcript.trim();
    if (!normalized) {
      failLiveVoice("No speech was captured. Try the turn again.");
      return;
    }
    liveVoiceShouldListenRef.current = !liveVoiceStateRef.current.muted;
    dispatchLiveVoice({ type: "THINKING", transcript: normalized });
    void sendChatMessage(normalized, {
      preserveDraft: true,
      liveVoice: true,
    });
  }

  function finishBrowserLiveVoiceTurn(epoch: number) {
    if (
      !liveVoiceSubmitPendingRef.current ||
      epoch !== liveVoiceEpochRef.current
    ) {
      return;
    }
    liveVoiceSubmitPendingRef.current = false;
    const transcript =
      liveVoiceTranscriptRef.current.trim() ||
      liveVoiceInterimRef.current.trim();
    sendLiveVoiceTranscript(transcript);
  }

  async function startLiveVoiceListening(epoch = liveVoiceEpochRef.current) {
    if (
      epoch !== liveVoiceEpochRef.current ||
      !liveVoiceShouldListenRef.current ||
      !voiceInputProvider
    ) {
      return;
    }
    resetLiveVoiceTranscript();
    dispatchLiveVoice({ type: "LISTENING" });

    if (voiceInputProvider.id === "browser") {
      const session = startBrowserDictation({
        onFinal: (text) => {
          if (epoch !== liveVoiceEpochRef.current) return;
          liveVoiceTranscriptRef.current = joinVoiceDraft(
            liveVoiceTranscriptRef.current,
            text,
          );
          dispatchLiveVoice({ type: "TRANSCRIPT", final: text, interim: "" });
        },
        onInterim: (text) => {
          if (epoch !== liveVoiceEpochRef.current) return;
          liveVoiceInterimRef.current = text;
          dispatchLiveVoice({ type: "TRANSCRIPT", interim: text });
        },
        onError: (message) => {
          if (epoch === liveVoiceEpochRef.current) failLiveVoice(message);
        },
        onEnd: () => {
          liveVoiceDictationRef.current = null;
          if (epoch !== liveVoiceEpochRef.current) return;
          if (liveVoiceSubmitPendingRef.current) {
            finishBrowserLiveVoiceTurn(epoch);
          } else if (liveVoiceShouldListenRef.current) {
            window.setTimeout(
              () => void startLiveVoiceListening(epoch),
              250,
            );
          }
        },
      });
      if (!session) {
        failLiveVoice("Browser speech recognition is unavailable.");
        return;
      }
      liveVoiceDictationRef.current = session;
      return;
    }

    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      failLiveVoice("Audio recording is unavailable on this device.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (
        epoch !== liveVoiceEpochRef.current ||
        !liveVoiceShouldListenRef.current
      ) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      liveVoiceStreamRef.current = stream;
      const chunks: Blob[] = [];
      const recorder = new MediaRecorder(stream);
      liveVoiceRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onerror = () => {
        if (epoch === liveVoiceEpochRef.current) {
          failLiveVoice("Audio recording stopped unexpectedly.");
        }
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        if (liveVoiceStreamRef.current === stream) {
          liveVoiceStreamRef.current = null;
        }
        if (liveVoiceRecorderRef.current === recorder) {
          liveVoiceRecorderRef.current = null;
        }
        const shouldSubmit = liveVoiceSubmitPendingRef.current;
        liveVoiceSubmitPendingRef.current = false;
        const audio = new Blob(chunks, {
          type: recorder.mimeType || "audio/webm",
        });
        if (!shouldSubmit || epoch !== liveVoiceEpochRef.current) return;
        if (audio.size === 0) {
          failLiveVoice("No audio was captured. Try the turn again.");
          return;
        }
        void transcribeWithHermes(audio)
          .then((result) => {
            if (epoch !== liveVoiceEpochRef.current) return;
            dispatchLiveVoice({
              type: "TRANSCRIPT",
              final: result.transcript,
              interim: "",
            });
            sendLiveVoiceTranscript(result.transcript);
          })
          .catch((error) => {
            if (epoch !== liveVoiceEpochRef.current) return;
            failLiveVoice(
              error instanceof Error
                ? error.message
                : "Hermes transcription failed.",
            );
          });
      };
      recorder.start();
    } catch (error) {
      failLiveVoice(
        error instanceof Error ? error.message : "Microphone access failed.",
      );
    }
  }

  function startLiveVoiceListeningWhenIdle(epoch: number) {
    if (
      epoch !== liveVoiceEpochRef.current ||
      !liveVoiceShouldListenRef.current
    ) {
      return;
    }
    if (abortRef.current) {
      window.setTimeout(() => startLiveVoiceListeningWhenIdle(epoch), 50);
      return;
    }
    void startLiveVoiceListening(epoch);
  }

  function startLiveVoiceSession() {
    if (isListening) {
      dictationRef.current?.stop();
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.stop();
      }
      setIsListening(false);
      setInterimTranscript("");
    }
    liveVoiceShouldListenRef.current = false;
    liveVoiceSubmitPendingRef.current = false;
    stopLiveVoiceCapture();
    abortRef.current?.abort();
    stopSpeaking();
    liveVoiceEpochRef.current += 1;
    resetLiveVoiceTranscript();
    dispatchLiveVoice({
      type: "START",
      available: liveVoiceAvailable,
      reason: liveVoiceUnavailableReason ?? undefined,
    });
    if (!liveVoiceAvailable) return;
    liveVoiceShouldListenRef.current = true;
    startLiveVoiceListeningWhenIdle(liveVoiceEpochRef.current);
  }

  function submitLiveVoiceTurn() {
    if (liveVoice.phase !== "listening") return;
    liveVoiceSubmitPendingRef.current = true;
    liveVoiceShouldListenRef.current = false;
    dispatchLiveVoice({ type: "TRANSCRIBING" });
    if (voiceInputProvider?.id === "browser") {
      const dictation = liveVoiceDictationRef.current;
      if (!dictation) {
        failLiveVoice("The microphone is not listening. Try the turn again.");
        return;
      }
      dictation.stop();
      return;
    }
    const recorder = liveVoiceRecorderRef.current;
    if (recorder?.state === "recording") recorder.stop();
    else {
      failLiveVoice(
        "The microphone is not recording. Start the turn again.",
      );
    }
  }

  function toggleLiveVoiceMute() {
    if (liveVoice.muted) {
      dispatchLiveVoice({ type: "UNMUTE" });
      liveVoiceShouldListenRef.current = true;
      if (!["transcribing", "thinking", "speaking"].includes(liveVoice.phase)) {
        liveVoiceEpochRef.current += 1;
        void startLiveVoiceListening(liveVoiceEpochRef.current);
      }
      return;
    }
    dispatchLiveVoice({ type: "MUTE" });
    liveVoiceShouldListenRef.current = false;
    if (liveVoice.phase === "listening") {
      liveVoiceEpochRef.current += 1;
      liveVoiceSubmitPendingRef.current = false;
      stopLiveVoiceCapture();
    }
  }

  function interruptLiveVoice() {
    liveVoiceEpochRef.current += 1;
    liveVoiceSubmitPendingRef.current = false;
    stopLiveVoiceCapture();
    abortRef.current?.abort();
    stopSpeaking();
    dispatchLiveVoice({ type: "INTERRUPT" });
    liveVoiceShouldListenRef.current = !liveVoice.muted;
    if (!liveVoice.muted) {
      startLiveVoiceListeningWhenIdle(liveVoiceEpochRef.current);
    }
  }

  function endLiveVoiceSession() {
    liveVoiceEpochRef.current += 1;
    liveVoiceShouldListenRef.current = false;
    liveVoiceSubmitPendingRef.current = false;
    stopLiveVoiceCapture();
    if (["thinking", "speaking"].includes(liveVoice.phase)) {
      abortRef.current?.abort();
    }
    stopSpeaking();
    resetLiveVoiceTranscript();
    dispatchLiveVoice({ type: "END" });
  }

  return {
    composerRef,
    interimTranscript,
    isListening,
    isSendingChat,
    isSpeaking,
    liveVoice,
    streamingReply,
    addTextAttachments,
    cancelActiveConversation,
    endLiveVoiceSession,
    interruptLiveVoice,
    retryMessage,
    startLiveVoiceSession,
    startVoiceDraft,
    stopActiveResponse,
    stopSpeaking,
    submitComposer,
    submitLiveVoiceTurn,
    toggleLiveVoiceMute,
  };
}
