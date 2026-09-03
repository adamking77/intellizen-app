import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import {
  ACP_ENGINES,
  ACP_ENGINE_LABEL,
  defaultAcpLaunch,
  listAcpAgents,
  probeAcpCommands,
  type AcpEngine,
} from "@/engine/acp-registry";
import { useEngineStore } from "@/engine/engine-store";
import { errorMessage } from "@/lib/toast";
import { cn } from "@/lib/utils";

import { SETTINGS_TITLE } from "./settings-style";

type ProviderRow = {
  engine: AcpEngine;
  command: string;
  configured: number;
  available: boolean;
  path: string;
};

async function listAcpProviders(): Promise<ProviderRow[]> {
  const agents = await listAcpAgents();
  const commands = [
    ...ACP_ENGINES.map((engine) => defaultAcpLaunch(engine).command),
    ...agents.map((agent) => agent.command),
  ];
  const probes = await probeAcpCommands(commands);
  const byCommand = new Map(probes.map((probe) => [probe.command, probe]));
  return ACP_ENGINES.map((engine) => {
    const configured = agents.filter((agent) => agent.engine === engine);
    const command = configured[0]?.command ?? defaultAcpLaunch(engine).command;
    const candidates = configured.length ? configured.map((agent) => agent.command) : [command];
    const found = candidates.map((item) => byCommand.get(item)).find((item) => item?.available);
    return {
      engine,
      command,
      configured: configured.length,
      available: Boolean(found),
      path: found?.path ?? byCommand.get(command)?.path ?? command,
    };
  });
}

export function ProvidersSettings() {
  const navigate = useNavigate();
  const connection = useEngineStore((state) => state.connection);
  const info = useEngineStore((state) => state.info);
  const engineError = useEngineStore((state) => state.error);
  const providers = useQuery({ queryKey: ["settings", "acp-providers"], queryFn: listAcpProviders, staleTime: 15_000 });
  const hermesReady = connection === "open";

  return (
    <div className="space-y-1">
      <header className="flex items-start gap-4 pb-3">
        <div className="min-w-0 flex-1">
          <h1 className={SETTINGS_TITLE}>Providers</h1>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-[var(--subtext-0)]">
            Hermes is the engine. Claude Code, Codex, Gemini and Qwen join as agents through ACP and start on demand.
          </p>
        </div>
        <button type="button" className="action" onClick={() => void providers.refetch()} disabled={providers.isFetching}>
          {providers.isFetching ? "Scanning…" : "Rescan"}
        </button>
      </header>

      <ProviderLine
        name="Hermes"
        kind="engine"
        state={hermesReady ? "connected" : connection === "connecting" || connection === "idle" ? "starting…" : "offline"}
        detail={hermesReady && info ? `${info.version ?? "running"} · 127.0.0.1:${info.port}` : engineError || "The app starts Hermes automatically."}
        path="hermes serve · gateway + REST"
      />

      {providers.isPending ? [0, 1, 2, 3].map((row) => <div key={row} className="h-[62px] animate-pulse border-b border-[var(--hair)] bg-[var(--line)] opacity-20" />) : null}
      {providers.error ? <p className="rounded-[var(--r-row)] bg-[var(--mantle)] px-3 py-2 text-xs text-[var(--danger)]">ACP discovery failed — {errorMessage(providers.error)}</p> : null}
      {(providers.data ?? []).map((provider) => (
        <ProviderLine
          key={provider.engine}
          name={ACP_ENGINE_LABEL[provider.engine]}
          kind="ACP"
          state={provider.available ? "ready on demand" : "adapter missing"}
          detail={provider.configured ? `${provider.configured} configured ${provider.configured === 1 ? "agent" : "agents"}` : "No agent configured"}
          path={provider.path}
          bad={!provider.available}
          onManage={() => navigate("/agents")}
        />
      ))}

      <p className="pt-3 text-[11px] leading-5 text-[var(--overlay-1)]">
        Credentials remain with Hermes or the provider CLI. IntelliZen stores no provider credential here.
      </p>
    </div>
  );
}

function ProviderLine({
  name,
  kind,
  state,
  detail,
  path,
  bad,
  onManage,
}: {
  name: string;
  kind: string;
  state: string;
  detail: string;
  path: string;
  bad?: boolean;
  onManage?: () => void;
}) {
  return (
    <div className="flex min-h-[62px] items-center gap-3 border-b border-[var(--hair)] py-2.5">
      <span className="w-28 shrink-0 font-ui text-sm text-[var(--text)]">{name}</span>
      <span className="shrink-0 rounded-full bg-[color-mix(in_srgb,var(--text)_8%,transparent)] px-2 py-0.5 font-mono text-[10px] text-[var(--overlay-1)]">{kind}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-[10px] text-[var(--overlay-1)]">{path}</p>
        <p className={cn("mt-0.5 truncate text-[11px]", bad ? "text-[var(--danger)]" : "text-[var(--subtext-0)]")}>{detail}</p>
      </div>
      <span className={cn(
        "shrink-0 rounded-full px-2 py-0.5 font-ui text-[10px]",
        bad ? "bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] text-[var(--danger)]" : "bg-[color-mix(in_srgb,var(--success)_12%,transparent)] text-[var(--success)]",
      )}>{state}</span>
      {onManage ? <button type="button" className="action" onClick={onManage}>Agents</button> : null}
    </div>
  );
}
