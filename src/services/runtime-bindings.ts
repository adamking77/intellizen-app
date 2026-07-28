import { invoke } from "@tauri-apps/api/core";

export type RuntimeCapabilityEvidence = {
  suiteVersion: string;
  passed: string[];
  cliVersion: string;
};

export type RuntimeModelPolicy = {
  default: string;
  allowed: string[];
};

export type RuntimeBinding = {
  bindingId: string;
  adapterId: "hermes" | "codex-cli" | "claude-cli";
  canonicalBinary: string;
  argTemplates: string[];
  workingDirGrants: string[];
  providerPermissionMode: string;
  envPolicy: "sanitized";
  workerProfileHome: string;
  secretRefs: string[];
  capabilityEvidence: RuntimeCapabilityEvidence;
  modelPolicy: RuntimeModelPolicy;
};

export type RuntimeBindingsStore = {
  version: 1;
  bindings: RuntimeBinding[];
};

export const HERMES_FIONA_BINDING_ID = "hermes-fiona";

export const HERMES_FIONA_BINDING: RuntimeBinding = {
  bindingId: HERMES_FIONA_BINDING_ID,
  adapterId: "hermes",
  canonicalBinary: "intellizen-native-hermes-host",
  argTemplates: [],
  workingDirGrants: [],
  providerPermissionMode: "profile-scoped",
  envPolicy: "sanitized",
  workerProfileHome: "provider-managed:fiona",
  secretRefs: [],
  capabilityEvidence: {
    suiteVersion: "native-hermes-host-v1",
    passed: ["structured-output", "stream", "cancel", "timeout", "usage"],
    cliVersion: "native-host",
  },
  modelPolicy: { default: "", allowed: [] },
};

export function effectiveRuntimeBindings(bindings: RuntimeBinding[]) {
  return [
    HERMES_FIONA_BINDING,
    ...bindings.filter(
      (binding) => binding.bindingId !== HERMES_FIONA_BINDING_ID,
    ),
  ];
}

export function builtinBindingRefForRoleOccupant(
  roleKey: string,
  agentKey: string | null,
) {
  return roleKey === "operations_director" && agentKey === "fiona"
    ? HERMES_FIONA_BINDING_ID
    : null;
}

export type RuntimeBindingMutationResult = {
  dryRun: boolean;
  writePerformed: boolean;
  binding: RuntimeBinding;
};

export function listRuntimeBindings() {
  return invoke<RuntimeBindingsStore>("runtime_bindings_list");
}

export function previewRuntimeBinding(binding: RuntimeBinding) {
  return invoke<RuntimeBindingMutationResult>("runtime_bindings_upsert", {
    binding,
    confirmWrite: false,
  });
}

export function saveRuntimeBinding(binding: RuntimeBinding) {
  return invoke<RuntimeBindingMutationResult>("runtime_bindings_upsert", {
    binding,
    confirmWrite: true,
  });
}

export type RuntimeProfileMutationResult = {
  dryRun: boolean;
  writePerformed: boolean;
  bindingId: string;
  profilePath: string;
};

export function prepareRuntimeWorkerProfile(bindingId: string) {
  return invoke<RuntimeProfileMutationResult>(
    "runtime_binding_prepare_worker_profile",
    { bindingId, confirmWrite: true },
  );
}
