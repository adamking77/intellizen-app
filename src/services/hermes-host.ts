import { Channel, invoke, isTauri } from "@tauri-apps/api/core";

export type HermesHostChatTurn = {
  role: "user" | "assistant";
  content: string;
};

type HermesHostStreamEvent = {
  kind: "delta";
  text: string;
};

type HermesHostStreamResult = {
  text: string;
  sessionId: string | null;
};

type HermesHostRunStart = {
  runId: string;
};

export type HermesHostRunStatus = {
  status: string;
  output: string | null;
  error: string | null;
  usage: {
    inputTokens: number;
    outputTokens: number;
  } | null;
};

function requireTauri() {
  if (!isTauri()) {
    throw new Error(
      "Hermes credentials are available only through the IntelliZen desktop host.",
    );
  }
}

export async function checkHermesHostApi() {
  if (!isTauri()) return false;
  return invoke<boolean>("hermes_check_api");
}

export async function streamHermesHostChat(input: {
  message: string;
  history?: HermesHostChatTurn[];
  systemPrompt?: string;
  onDelta: (text: string) => void;
  signal?: AbortSignal;
}) {
  requireTauri();
  const requestId = `hermes-chat-${crypto.randomUUID()}`;
  const channel = new Channel<HermesHostStreamEvent>();
  channel.onmessage = (event) => {
    if (event.kind === "delta") input.onDelta(event.text);
  };
  const abort = () => {
    void invoke<boolean>("hermes_cancel_stream", { requestId });
  };
  input.signal?.addEventListener("abort", abort, { once: true });
  try {
    const result = await invoke<HermesHostStreamResult>("hermes_stream_chat", {
      input: {
        requestId,
        message: input.message,
        history: input.history ?? [],
        systemPrompt: input.systemPrompt ?? null,
      },
      onEvent: channel,
    });
    if (input.signal?.aborted) {
      throw new DOMException("Hermes response was stopped.", "AbortError");
    }
    return result;
  } catch (error) {
    if (input.signal?.aborted) {
      throw new DOMException("Hermes response was stopped.", "AbortError");
    }
    throw error;
  } finally {
    input.signal?.removeEventListener("abort", abort);
  }
}

export async function startHermesHostRun(input: {
  prompt: string;
  instructions?: string;
}) {
  requireTauri();
  return invoke<HermesHostRunStart>("hermes_run_start", {
    input: {
      prompt: input.prompt,
      instructions: input.instructions ?? null,
    },
  });
}

export async function getHermesHostRunStatus(runId: string) {
  requireTauri();
  return invoke<HermesHostRunStatus>("hermes_run_status", { runId });
}

export async function checkHermesHostGateway() {
  if (!isTauri()) return false;
  return invoke<boolean>("hermes_check_gateway");
}

export async function submitHermesHostGateway(input: {
  event: "intellizen.workflow" | "intellizen.chat";
  payload: Record<string, unknown>;
  profile?: string | null;
  deliveryId: string;
}) {
  requireTauri();
  return invoke<Record<string, unknown>>("hermes_gateway_submit", { input });
}
