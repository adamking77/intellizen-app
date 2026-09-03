import { open as pickFolder } from "@tauri-apps/plugin-dialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { tildify } from "@/components/layout/workspace-tree";
import {
  DEFAULT_WORKSPACE_KEY,
  RECONNECT_ON_LAUNCH_KEY,
  SCAN_ON_LAUNCH_KEY,
  SEND_ON_ENTER_KEY,
  SHOW_REASONING_KEY,
  usePreference,
} from "@/lib/settings-preferences";
import { errorMessage } from "@/lib/toast";
import { disconnectEngine } from "@/engine/use-engine";
import { useEngineStore } from "@/engine/engine-store";
import { disconnectAllAcpProviders, listAcpProviderStatuses } from "@/engine/acp-registry";

import { SettingSwitch } from "./setting-switch";
import { SETTINGS_TITLE } from "./settings-style";

export function GeneralSettings() {
  const queryClient = useQueryClient();
  const [workspace, setWorkspace] = usePreference(DEFAULT_WORKSPACE_KEY, "");
  const [reasoning, setReasoning] = usePreference(SHOW_REASONING_KEY, "1");
  const [sendOnEnter, setSendOnEnter] = usePreference(SEND_ON_ENTER_KEY, "1");
  const [scanOnLaunch, setScanOnLaunch] = usePreference(SCAN_ON_LAUNCH_KEY, "1");
  const [reconnectOnLaunch, setReconnectOnLaunch] = usePreference(RECONNECT_ON_LAUNCH_KEY, "1");
  const [busy, setBusy] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const connected = useEngineStore((state) => state.connection === "open");
  const acpStatuses = useQuery({
    queryKey: ["settings", "acp-statuses"],
    queryFn: listAcpProviderStatuses,
    refetchInterval: 2_000,
  });
  const connectedCount = (connected ? 1 : 0) + (acpStatuses.data?.length ?? 0);

  const chooseWorkspace = async () => {
    setBusy(true);
    setError(null);
    try {
      const picked = await pickFolder({ directory: true, multiple: false });
      if (typeof picked === "string" && picked) setWorkspace(tildify(picked.replace(/\/$/, "")));
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <header className="pb-3">
        <h1 className={SETTINGS_TITLE}>General</h1>
        <p className="mt-1 text-xs leading-5 text-[var(--subtext-0)]">Startup and defaults.</p>
      </header>
      <div className="max-w-[660px]">
        <SettingRow label="Default workspace" detail="Where a new conversation starts when its agent has no context folder.">
          <button type="button" className="action max-w-72 truncate font-mono" onClick={() => void chooseWorkspace()} disabled={busy}>
            {busy ? "Choosing…" : workspace || "Choose folder"}
          </button>
        </SettingRow>
        <SettingRow label="Scan on launch" detail="Find installed provider CLIs and ACP bridges at startup. Turn off to scan only on demand.">
          <SettingSwitch on={scanOnLaunch !== "0"} label="Scan on launch" onToggle={() => setScanOnLaunch(scanOnLaunch === "0" ? "1" : "0")} />
        </SettingRow>
        <SettingRow label="Reconnect on launch" detail="Restart Hermes and the CLI providers that were connected when IntelliZen closed.">
          <SettingSwitch on={reconnectOnLaunch !== "0"} label="Reconnect on launch" onToggle={() => setReconnectOnLaunch(reconnectOnLaunch === "0" ? "1" : "0")} />
        </SettingRow>
        <SettingRow label="Show agent reasoning" detail="Render thinking when a provider exposes it.">
          <SettingSwitch on={reasoning !== "0"} label="Show agent reasoning" onToggle={() => setReasoning(reasoning === "0" ? "1" : "0")} />
        </SettingRow>
        <SettingRow label="Send on Enter" detail="Off sends with ⌘↵, leaving Enter to insert a newline.">
          <SettingSwitch on={sendOnEnter !== "0"} label="Send on Enter" onToggle={() => setSendOnEnter(sendOnEnter === "0" ? "1" : "0")} />
        </SettingRow>
        <SettingRow label="Disconnect everything" detail="Stops Hermes and every live CLI provider session. They can be reconnected from Providers.">
          <button
            type="button"
            className="action action-tinted"
            style={{ "--tint": "var(--bad)" } as React.CSSProperties}
            disabled={connectedCount === 0 || disconnecting}
            onClick={() => {
              setDisconnecting(true);
              setError(null);
              void Promise.all([disconnectEngine(), disconnectAllAcpProviders()])
                .then(() => queryClient.invalidateQueries({ queryKey: ["settings", "acp-statuses"] }))
                .catch((reason) => setError(errorMessage(reason)))
                .finally(() => setDisconnecting(false));
            }}
          >
            {disconnecting ? "Disconnecting…" : connectedCount ? `Disconnect ${connectedCount}` : "Nothing connected"}
          </button>
        </SettingRow>
      </div>
      {error ? <p className="mt-3 text-xs text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}

function SettingRow({ label, detail, children }: { label: string; detail: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 border-b border-[var(--hair)] px-0.5 py-3 max-[900px]:flex-col max-[900px]:items-stretch max-[900px]:gap-2">
      <div className="min-w-0 flex-1">
        <p className="font-ui text-sm text-[var(--text)]">{label}</p>
        <p className="mt-0.5 text-xs leading-5 text-[var(--subtext-0)]">{detail}</p>
      </div>
      <div className="flex w-[220px] shrink-0 justify-end max-[900px]:w-full max-[900px]:justify-start">{children}</div>
    </div>
  );
}
