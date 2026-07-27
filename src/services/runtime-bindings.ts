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
  adapterId: "mock" | "hermes" | "codex-cli" | "claude-cli" | "gemini-cli";
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

export function previewRuntimeWorkerProfile(bindingId: string) {
  return invoke<RuntimeProfileMutationResult>(
    "runtime_binding_prepare_worker_profile",
    { bindingId, confirmWrite: false },
  );
}

export function prepareRuntimeWorkerProfile(bindingId: string) {
  return invoke<RuntimeProfileMutationResult>(
    "runtime_binding_prepare_worker_profile",
    { bindingId, confirmWrite: true },
  );
}
