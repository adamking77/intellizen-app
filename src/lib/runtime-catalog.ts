import type { AgentPanelRoleTarget } from "@/lib/agent-panel-roles";
import type { RuntimeBinding } from "@/services/runtime-bindings";
import type { RuntimeDiscovery } from "@/services/runtimes";

export type RuntimeCatalogItem = {
  adapterId: RuntimeDiscovery["adapterId"];
  bindingId: string;
  label: string;
  discovery: RuntimeDiscovery;
  binding: RuntimeBinding | null;
  assignedRoles: AgentPanelRoleTarget[];
  installed: boolean;
  supported: boolean;
  authenticated: boolean;
  bound: boolean;
  assigned: boolean;
  usable: boolean;
  blockers: string[];
  modelChoices: string[];
};

const RUNTIME_FACTS = {
  "codex-cli": { bindingId: "codex-local-primary", label: "Codex CLI" },
  "claude-cli": { bindingId: "claude-local-primary", label: "Claude Code" },
} as const;

export function buildRuntimeCatalog(input: {
  discoveries: RuntimeDiscovery[];
  bindings: RuntimeBinding[];
  roleTargets: AgentPanelRoleTarget[];
}): RuntimeCatalogItem[] {
  const bindings = new Map(input.bindings.map((binding) => [binding.bindingId, binding]));
  return input.discoveries.map((discovery) => {
    const fact = RUNTIME_FACTS[discovery.adapterId];
    const binding = bindings.get(fact.bindingId) ?? null;
    const assignedRoles = input.roleTargets.filter(
      (role) => role.bindingRef === fact.bindingId,
    );
    const installed = discovery.installed;
    const supported = discovery.supported;
    const authenticated = discovery.authState === "ready";
    const bound = Boolean(binding);
    const assigned = assignedRoles.length > 0;
    const blockers = [
      !installed ? "Runtime binary is not installed or could not be resolved." : null,
      installed && !supported
        ? `Installed version is outside ${discovery.supportRange}.`
        : null,
      installed && !authenticated ? "Worker profile requires provider sign-in." : null,
      !bound ? "No reviewed local runtime binding exists." : null,
      bound && !assigned ? "Binding is not assigned to an active role." : null,
    ].filter((value): value is string => Boolean(value));
    return {
      adapterId: discovery.adapterId,
      bindingId: fact.bindingId,
      label: fact.label,
      discovery,
      binding,
      assignedRoles,
      installed,
      supported,
      authenticated,
      bound,
      assigned,
      usable: blockers.length === 0,
      blockers,
      modelChoices: binding?.modelPolicy.allowed ?? [],
    };
  });
}

export type ConnectionFact = {
  id: "supabase" | "hermes-api" | "hermes-gateway" | "local-mcp";
  label: string;
  ready: boolean;
  detail: string;
};

export function deriveSystemHealth(input: {
  runtimes?: RuntimeCatalogItem[];
  connections?: ConnectionFact[];
  loading: boolean;
}) {
  if (input.loading) {
    return { state: "checking" as const, label: "Checking systems", problemCount: 0 };
  }
  const runtimeProblems = (input.runtimes ?? []).filter((runtime) => !runtime.usable).length;
  const connectionProblems = (input.connections ?? []).filter((connection) => !connection.ready).length;
  const problemCount = runtimeProblems + connectionProblems;
  return problemCount === 0
    ? { state: "ready" as const, label: "Systems ready", problemCount }
    : { state: "attention" as const, label: `${problemCount} system issue${problemCount === 1 ? "" : "s"}`, problemCount };
}
