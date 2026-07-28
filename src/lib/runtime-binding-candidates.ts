import {
  CLAUDE_WORKER_TOOLS,
  claudeExecArgs,
} from "@/lib/runtime-adapters";
import type { RuntimeBinding } from "@/services/runtime-bindings";
import type { RuntimeDiscovery } from "@/services/runtimes";

export function normalizeRuntimeModelPolicy(
  defaultModel: string,
  allowedModels: string | string[],
) {
  const normalizedDefault = defaultModel.trim();
  const allowed = Array.from(
    new Set(
      (Array.isArray(allowedModels)
        ? allowedModels
        : allowedModels.split(",")
      )
        .map((model) => model.trim())
        .filter(Boolean),
    ),
  );
  if (normalizedDefault && !allowed.includes(normalizedDefault)) {
    allowed.unshift(normalizedDefault);
  }
  return { default: normalizedDefault, allowed };
}

export function runtimeBindingCandidate(
  discovery: RuntimeDiscovery,
): RuntimeBinding {
  if (discovery.adapterId === "codex-cli") {
    return {
      bindingId: "codex-local-primary",
      adapterId: "codex-cli",
      canonicalBinary: discovery.binary,
      argTemplates: [
        "exec",
        "--strict-config",
        "--json",
        "--ephemeral",
        "--ignore-rules",
        "--sandbox",
        "workspace-write",
        "-c",
        'approval_policy="never"',
        "-C",
        "{workingDirectory}",
        "-",
      ],
      workingDirGrants: [],
      providerPermissionMode: "workspace-write",
      envPolicy: "sanitized",
      workerProfileHome: discovery.workerProfileHome,
      secretRefs: [],
      capabilityEvidence: {
        suiteVersion: "gate3",
        passed: ["structured-output", "stream", "cancel", "timeout", "usage"],
        cliVersion: discovery.version,
      },
      modelPolicy: { default: "", allowed: [] },
    };
  }

  return {
    bindingId: "claude-local-primary",
    adapterId: "claude-cli",
    canonicalBinary: discovery.binary,
    argTemplates: claudeExecArgs(
      `${discovery.workerProfileHome}/mcp-worker.json`,
    ),
    workingDirGrants: [],
    providerPermissionMode: "dontAsk",
    envPolicy: "sanitized",
    workerProfileHome: discovery.workerProfileHome,
    secretRefs: [],
    capabilityEvidence: {
      suiteVersion: "gate6",
      passed: [
        "structured-output",
        "stream",
        "cancel",
        "timeout",
        "usage",
        "strict-mcp-init-readback",
        `worker-tools:${CLAUDE_WORKER_TOOLS.length}`,
      ],
      cliVersion: discovery.version,
    },
    modelPolicy: { default: "", allowed: [] },
  };
}
