import { Channel, invoke } from "@tauri-apps/api/core";

export type NativeRuntimeEvent = {
  sequence: number;
  kind:
    | "spawned"
    | "stdout"
    | "stderr"
    | "completed"
    | "failed"
    | "cancelled"
    | "timed_out";
  text: string | null;
  exitCode: number | null;
};

export type RuntimeRunInput = {
  runId: string;
  binary: string;
  args: string[];
  workingDirectory: string;
  stdin: string | null;
  timeoutMs: number;
  environment: Partial<
    Record<
      | "CLAUDE_CONFIG_DIR"
      | "CODEX_HOME"
      | "INTELLIZEN_WORKER_BROKER_TOKEN"
      | "INTELLIZEN_WORKER_BROKER_URL"
      | "NO_COLOR"
      | "TERM",
      string
    >
  >;
};

export type RuntimeExit = {
  reason: "completed" | "failed" | "cancelled" | "timed_out";
  exitCode: number | null;
};

export async function runRuntime(
  input: RuntimeRunInput,
  onEvent: (event: NativeRuntimeEvent) => void,
) {
  const channel = new Channel<NativeRuntimeEvent>();
  channel.onmessage = onEvent;
  return invoke<RuntimeExit>("runtime_run", { input, onEvent: channel });
}

export function cancelRuntime(runId: string) {
  return invoke<boolean>("runtime_cancel", { runId });
}
