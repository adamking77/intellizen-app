import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { ChevronDown, SquareTerminal } from "lucide-react";

import {
  connectAcpProvider,
  disconnectAcpProvider,
  discoverAcpProviders,
  listAcpProviderStatuses,
  type AcpEngine,
} from "@/engine/acp-registry";
import { useEngineStore } from "@/engine/engine-store";
import { connectEngine, disconnectEngine } from "@/engine/use-engine";
import { errorMessage } from "@/lib/toast";
import { cn } from "@/lib/utils";

import { SETTINGS_TITLE } from "./settings-style";

export function ProvidersSettings() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const connection = useEngineStore((state) => state.connection);
  const info = useEngineStore((state) => state.info);
  const engineError = useEngineStore((state) => state.error);
  const providers = useQuery({ queryKey: ["settings", "acp-providers"], queryFn: discoverAcpProviders, staleTime: 15_000 });
  const statuses = useQuery({
    queryKey: ["settings", "acp-statuses"],
    queryFn: listAcpProviderStatuses,
    refetchInterval: 2_000,
  });
  const [busyProvider, setBusyProvider] = useState<AcpEngine | null>(null);
  const [providerErrors, setProviderErrors] = useState<Partial<Record<AcpEngine, string>>>({});
  const [rescanning, setRescanning] = useState(false);
  const [scanStatus, setScanStatus] = useState<string | null>(null);
  const hermesReady = connection === "open";

  const refreshAcp = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["settings", "acp-providers"] }),
      queryClient.invalidateQueries({ queryKey: ["settings", "acp-statuses"] }),
      queryClient.invalidateQueries({ queryKey: ["acp", "agents"] }),
      queryClient.invalidateQueries({ queryKey: ["agents", "list"] }),
    ]);
  };

  const connectProvider = async (provider: NonNullable<typeof providers.data>[number]) => {
    setBusyProvider(provider.engine);
    setProviderErrors((errors) => ({ ...errors, [provider.engine]: undefined }));
    try {
      await connectAcpProvider(provider);
    } catch (error) {
      setProviderErrors((errors) => ({ ...errors, [provider.engine]: errorMessage(error) }));
    } finally {
      await refreshAcp();
      setBusyProvider(null);
    }
  };

  const disconnectProvider = async (engine: AcpEngine) => {
    setBusyProvider(engine);
    setProviderErrors((errors) => ({ ...errors, [engine]: undefined }));
    try {
      await disconnectAcpProvider(engine);
    } catch (error) {
      setProviderErrors((errors) => ({ ...errors, [engine]: errorMessage(error) }));
    } finally {
      await refreshAcp();
      setBusyProvider(null);
    }
  };

  const rescan = async () => {
    setRescanning(true);
    setScanStatus(null);
    setProviderErrors({});
    try {
      const [found, live] = await Promise.all([providers.refetch(), statuses.refetch()]);
      if (found.error) throw found.error;
      if (live.error) throw live.error;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["acp", "agents"] }),
        queryClient.invalidateQueries({ queryKey: ["agents", "list"] }),
      ]);
      const available = (found.data ?? []).filter((provider) => provider.available).length;
      setScanStatus(`Scan complete · ${available} provider${available === 1 ? "" : "s"} available`);
    } catch (error) {
      setScanStatus(`Scan failed · ${errorMessage(error)}`);
    } finally {
      setRescanning(false);
    }
  };

  return (
    <div className="space-y-1">
      <header className="flex flex-wrap items-start gap-4 pb-1.5">
        <div className="min-w-0 flex-1">
          <h1 className={SETTINGS_TITLE}>Providers</h1>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-[var(--subtext-0)]">
            Hermes is the engine. Installed command-line agents that expose ACP join on demand.
          </p>
        </div>
        <button type="button" className="action" onClick={() => void rescan()} disabled={rescanning}>
          {rescanning ? "Scanning…" : "Rescan"}
        </button>
      </header>

      {scanStatus ? (
        <p className={cn("pb-1 text-[var(--t-meta)]", scanStatus.startsWith("Scan failed") ? "text-[var(--bad)]" : "text-[var(--ok)]")} role="status">
          {scanStatus}
        </p>
      ) : null}

      <ProviderLine
        name="Hermes"
        kind="engine"
        kindTone="runtime"
        tier="core"
        state={hermesReady ? "connected" : connection === "connecting" || connection === "idle" ? "starting…" : "offline"}
        connected={hermesReady}
        detail={hermesReady && info ? `${info.version ?? "running"} · 127.0.0.1:${info.port}` : engineError || "The app starts Hermes automatically."}
        path="hermes serve · gateway + REST"
        connections={hermesReady ? ["Gateway", "REST"] : []}
        capabilities="Local skills and plugins"
        onCapabilities={() => navigate("/settings?section=capabilities&provider=hermes")}
        invocation="hermes serve"
        bad={Boolean(engineError)}
        onConnect={() => void connectEngine()}
        onDisconnect={() => void disconnectEngine()}
        connecting={connection === "connecting" || (connection === "idle" && !engineError)}
      />

      {providers.isPending ? [0, 1, 2, 3].map((row) => <div key={row} className="mt-1 h-14 rounded-[var(--r-ctl)] bg-[var(--line)] opacity-40" />) : null}
      {providers.error ? <p className="rounded-[var(--r-ctl)] border border-[var(--bad)] bg-[color-mix(in_srgb,var(--bad)_11%,transparent)] px-3 py-2 text-xs text-[var(--danger)]">ACP discovery failed — {errorMessage(providers.error)}</p> : null}
      {(providers.data ?? []).map((provider) => {
        const live = (statuses.data ?? []).filter((status) => provider.agentIds.includes(status.agentId));
        const connected = live.length > 0;
        const problem = providerErrors[provider.engine];
        const state = connected
          ? "connected"
          : problem
            ? "connection failed"
            : provider.available
              ? provider.bridgeOnDemand
                ? "ready · bridge on first connect"
                : "ready"
              : provider.cliAvailable
                ? "ACP bridge unavailable"
                : "CLI not found";
        const detail = problem
          ? problem
          : connected
            ? `${live.length} live ${live.length === 1 ? "session" : "sessions"}`
            : provider.configured
              ? `${provider.configured} configured ${provider.configured === 1 ? "agent" : "agents"}`
              : `Connect creates the default ${provider.label} agent.`;
        return (
          <ProviderLine
            key={provider.engine}
            name={provider.label}
            icon={provider.icon}
            kind="runs as itself"
            kindTone="itself"
            tier="on demand"
            state={state}
            connected={connected}
            detail={detail}
            path={provider.path}
            bad={Boolean(problem) || !provider.available}
            connections={live.length ? live.map((status) => status.sessionId || status.agentId) : provider.configured ? [`${provider.configured} agent${provider.configured === 1 ? "" : "s"}`] : []}
            capabilities="Skills, commands, plugins, MCP connections"
            onCapabilities={() => navigate(`/settings?section=capabilities&provider=${encodeURIComponent(provider.engine)}`)}
            invocation={[provider.command, ...provider.args].join(" ")}
            connecting={busyProvider === provider.engine}
            onConnect={provider.available ? () => void connectProvider(provider) : undefined}
            onDisconnect={() => void disconnectProvider(provider.engine)}
            onManage={provider.configured ? () => navigate("/agents") : undefined}
          />
        );
      })}

      <p className="pt-3 text-[var(--t-section)] leading-5 text-[var(--overlay-1)]">
        Credentials remain with Hermes or the provider CLI. IntelliZen stores no provider credential here.
      </p>
      <p className="text-[var(--t-section)] leading-5 text-[var(--overlay-1)]">
        Discovery matches the official ACP registry against executable paths from your login shell and local ACP adapters. Use Rescan after installing or moving a CLI.
      </p>
    </div>
  );
}

function ProviderLine({
  name,
  icon,
  kind,
  kindTone,
  tier,
  state,
  connected,
  detail,
  path,
  bad,
  connections,
  capabilities,
  invocation,
  connecting,
  onConnect,
  onDisconnect,
  onManage,
  onCapabilities,
}: {
  name: string;
  icon?: string;
  kind: string;
  kindTone: "runtime" | "itself";
  tier: string;
  state: string;
  connected?: boolean;
  detail: string;
  path: string;
  bad?: boolean;
  connections: string[];
  capabilities: string;
  invocation: string;
  connecting?: boolean;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onManage?: () => void;
  onCapabilities: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-[var(--hair)]">
      <div className="hoverable flex min-h-14 flex-wrap items-center gap-3 px-0.5 py-4">
        <ProviderIcon src={icon} hermes={kindTone === "runtime"} />
        <span className="w-[118px] shrink-0 font-ui text-[var(--t-ui)] text-[var(--text)]">{name}</span>
        <span className={cn(
          "shrink-0 rounded-[var(--r-pill)] px-2 py-0.5 font-ui text-[var(--t-count)]",
          kindTone === "runtime"
            ? "bg-[color-mix(in_srgb,var(--runtime)_14%,transparent)] text-[var(--runtime)]"
            : "bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)]",
        )}>
          {kindTone === "itself" ? <span aria-hidden className="mr-1 inline-block h-1.5 w-1.5 rounded-[var(--r-pill)] bg-[var(--runtime)] align-px" /> : null}
          {kind}
        </span>
        <span className="shrink-0 rounded-[var(--r-pill)] bg-[color-mix(in_srgb,var(--text)_9%,transparent)] px-2 py-0.5 font-ui text-[var(--t-count)] text-[var(--overlay-1)]">{tier}</span>
        <div className="min-w-0 flex-1 max-[900px]:order-last max-[900px]:basis-full">
          <p className="truncate font-mono text-[var(--t-count)] text-[var(--overlay-1)]">{path}</p>
          <p className={cn("mt-0.5 truncate text-[var(--t-meta)]", bad ? "text-[var(--danger)]" : "text-[var(--subtext-0)]")}>{detail}</p>
        </div>
        {connecting ? <span className="shrink-0 rounded-[var(--r-pill)] bg-[color-mix(in_srgb,var(--text)_8%,transparent)] px-2 py-0.5 text-[var(--t-count)] text-[var(--overlay-1)]">connecting…</span> : null}
        {!connecting && connected && onDisconnect ? (
          <div className="flex shrink-0 items-center gap-2">
            <span className="rounded-[var(--r-pill)] bg-[color-mix(in_srgb,var(--ok)_14%,transparent)] px-2 py-0.5 font-ui text-[var(--t-count)] text-[var(--ok)]">connected</span>
            <button type="button" className="action" onClick={(event) => { event.stopPropagation(); onDisconnect(); }}>Disconnect</button>
          </div>
        ) : null}
        {!connecting && !connected && onConnect ? <button type="button" className="action" onClick={(event) => { event.stopPropagation(); onConnect(); }}>Connect</button> : null}
        {!onConnect && !connected && (
          <span className={cn(
            "shrink-0 rounded-[var(--r-pill)] px-2 py-0.5 font-ui text-[var(--t-count)]",
            bad ? "bg-[color-mix(in_srgb,var(--bad)_14%,transparent)] text-[var(--bad)]" : "bg-[color-mix(in_srgb,var(--ok)_14%,transparent)] text-[var(--ok)]",
          )}>{state}</span>
        )}
        {onManage ? <button type="button" className="action" onClick={(event) => { event.stopPropagation(); onManage(); }}>Agents</button> : null}
        <button
          type="button"
          className="icon-button"
          aria-label={`${open ? "Collapse" : "Expand"} ${name} details`}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <ChevronDown className={cn("h-3 w-3 shrink-0 transition-transform", open && "rotate-180")} strokeWidth={2.2} aria-hidden />
        </button>
      </div>
      {open ? (
        <div className="flex flex-col gap-2.5 px-3 pb-4 pl-9 pt-1 text-[var(--t-meta)]">
          <div>
            <span className="font-ui text-[var(--t-count)] font-light uppercase tracking-[0.14em] text-[var(--overlay-1)]">Connections</span>
            <div className="mt-1 flex flex-wrap gap-1">
              {connections.length ? connections.map((connection) => <span key={connection} className="rounded-[var(--r-ctl)] bg-[var(--crust)] px-2.5 py-1 text-[var(--subtext-0)]">{connection}</span>) : <span className="text-[var(--overlay-1)]">None configured.</span>}
            </div>
          </div>
          <div className="flex flex-wrap items-baseline gap-2"><span className="font-ui text-[var(--t-count)] font-light uppercase tracking-[0.14em] text-[var(--overlay-1)]">Capabilities</span><button type="button" className="text-left text-[var(--subtext-0)] hover:text-[var(--text)] hover:underline" onClick={onCapabilities}>View {capabilities.toLowerCase()}</button></div>
          <div className="flex items-baseline gap-2"><span className="font-ui text-[var(--t-count)] font-light uppercase tracking-[0.14em] text-[var(--overlay-1)]">Invoked as</span><span className="font-mono text-[var(--subtext-0)]">{invocation}</span></div>
          <p className="max-w-[62ch] leading-[1.45] text-[var(--overlay-1)]">Credentials and connection configuration stay with Hermes or the provider CLI; IntelliZen never stores them here.</p>
        </div>
      ) : null}
    </div>
  );
}

function ProviderIcon({ src, hermes }: { src?: string; hermes?: boolean }) {
  if (hermes) {
    return (
      <svg
        aria-hidden
        className="h-5 w-5 shrink-0 text-[var(--runtime)]"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 17 9 7l5 10M6.2 13.4h5.6M17.5 7v10" />
        <circle cx="17.5" cy="17" r="0.9" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (src) {
    return (
      <span
        aria-hidden
        className="h-5 w-5 shrink-0 bg-[var(--accent)]"
        data-provider-icon="registry"
        style={{
          maskImage: `url("${src}")`,
          maskMode: "alpha",
          maskPosition: "center",
          maskRepeat: "no-repeat",
          maskSize: "contain",
          WebkitMaskImage: `url("${src}")`,
          WebkitMaskPosition: "center",
          WebkitMaskRepeat: "no-repeat",
          WebkitMaskSize: "contain",
        }}
      />
    );
  }
  return <SquareTerminal aria-hidden className="h-5 w-5 shrink-0 text-[var(--overlay-1)]" strokeWidth={1.6} />;
}
