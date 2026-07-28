import { buildRuntimeCatalog, type ConnectionFact } from "@/lib/runtime-catalog";
import { supabase } from "@/lib/supabase";
import { listAgentPanelRoleTargets } from "@/services/agent-panel-roles";
import { checkHermesHostApi, checkHermesHostGateway } from "@/services/hermes-host";
import { listRuntimeBindings } from "@/services/runtime-bindings";
import { discoverClaudeRuntime, discoverCodexRuntime } from "@/services/runtimes";

export async function inspectRuntimeCatalog() {
  const [codex, claude, store, roles] = await Promise.all([
    discoverCodexRuntime(),
    discoverClaudeRuntime(),
    listRuntimeBindings(),
    listAgentPanelRoleTargets(),
  ]);
  return buildRuntimeCatalog({
    discoveries: [codex, claude],
    bindings: store.bindings,
    roleTargets: roles,
  });
}

async function connectionFact(
  id: ConnectionFact["id"],
  label: string,
  check: () => Promise<boolean>,
  readyDetail: string,
  failedDetail: string,
): Promise<ConnectionFact> {
  try {
    const ready = await check();
    return { id, label, ready, detail: ready ? readyDetail : failedDetail };
  } catch (error) {
    return { id, label, ready: false, detail: String(error) };
  }
}

export async function inspectSettingsConnections(): Promise<ConnectionFact[]> {
  return Promise.all([
    connectionFact(
      "supabase",
      "Supabase workspace",
      async () => {
        const { error } = await supabase.schema("workspace").from("databases").select("id").limit(1);
        if (error) throw error;
        return true;
      },
      "Workspace read plane responded.",
      "Workspace read plane did not respond.",
    ),
    connectionFact("hermes-api", "Hermes API", checkHermesHostApi, "Local host API responded.", "Local host API is unavailable."),
    connectionFact("hermes-gateway", "Hermes gateway", checkHermesHostGateway, "Local gateway responded.", "Local gateway is unavailable."),
    connectionFact(
      "local-mcp",
      "IntelliZen local MCP",
      async () => {
        await listRuntimeBindings();
        return true;
      },
      "Native local binding store responded.",
      "Native local binding store is unavailable.",
    ),
  ]);
}
