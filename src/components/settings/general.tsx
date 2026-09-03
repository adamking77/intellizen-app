import { open as pickFolder } from "@tauri-apps/plugin-dialog";
import { useState } from "react";

import { tildify } from "@/components/layout/workspace-tree";
import {
  DEFAULT_WORKSPACE_KEY,
  SEND_ON_ENTER_KEY,
  SHOW_REASONING_KEY,
  usePreference,
} from "@/lib/settings-preferences";
import { errorMessage } from "@/lib/toast";

import { SettingSwitch } from "./setting-switch";
import { SETTINGS_TITLE } from "./settings-style";

export function GeneralSettings() {
  const [workspace, setWorkspace] = usePreference(DEFAULT_WORKSPACE_KEY, "");
  const [reasoning, setReasoning] = usePreference(SHOW_REASONING_KEY, "1");
  const [sendOnEnter, setSendOnEnter] = usePreference(SEND_ON_ENTER_KEY, "1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        <p className="mt-1 text-xs leading-5 text-[var(--subtext-0)]">Agent-panel defaults.</p>
      </header>
      <div className="max-w-2xl">
        <SettingRow label="Default workspace" detail="Where a new conversation starts when its agent has no context folder.">
          <button type="button" className="action max-w-72 truncate font-mono" onClick={() => void chooseWorkspace()} disabled={busy}>
            {busy ? "Choosing…" : workspace || "Choose folder"}
          </button>
        </SettingRow>
        <SettingRow label="Show agent reasoning" detail="Render thinking when a provider exposes it.">
          <SettingSwitch on={reasoning !== "0"} label="Show agent reasoning" onToggle={() => setReasoning(reasoning === "0" ? "1" : "0")} />
        </SettingRow>
        <SettingRow label="Send on Enter" detail="Off sends with ⌘↵, leaving Enter to insert a newline.">
          <SettingSwitch on={sendOnEnter !== "0"} label="Send on Enter" onToggle={() => setSendOnEnter(sendOnEnter === "0" ? "1" : "0")} />
        </SettingRow>
      </div>
      {error ? <p className="mt-3 text-xs text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}

function SettingRow({ label, detail, children }: { label: string; detail: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[66px] items-center gap-5 border-b border-[var(--hair)] py-3">
      <div className="min-w-0 flex-1">
        <p className="font-ui text-sm text-[var(--text)]">{label}</p>
        <p className="mt-0.5 text-xs leading-5 text-[var(--subtext-0)]">{detail}</p>
      </div>
      {children}
    </div>
  );
}
