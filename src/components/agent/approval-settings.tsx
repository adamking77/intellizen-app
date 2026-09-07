import { useEffect, useRef, useState } from "react";

import { permissionLabel } from "./agent-composer";
import type { ApprovalMode } from "@/engine/approval-mode";
import { Control } from "@/components/ui/control";
import { AppDialog } from "@/components/ui/app-dialog";

const OPTIONS: Array<{ mode: ApprovalMode; detail: string }> = [
  { mode: "manual", detail: "Ask before a flagged risky action runs." },
  { mode: "smart", detail: "Review flagged risky actions automatically and ask when the reviewer cannot decide." },
  { mode: "off", detail: "Bypass approval prompts for this profile. Hard safety blocks still apply." },
];

export function ApprovalSettings({
  profile,
  sessionId,
  effectiveMode,
  read,
  save,
}: {
  profile: string;
  sessionId: string | null;
  effectiveMode: ApprovalMode;
  read: (profile: string, sessionId: string | null) => Promise<ApprovalMode>;
  save: (profile: string, sessionId: string | null, mode: ApprovalMode) => Promise<ApprovalMode>;
}) {
  const scopeKey = `${profile}:${sessionId ?? ""}`;
  const currentScope = useRef(scopeKey);
  currentScope.current = scopeKey;
  const attempt = useRef(0);
  const [open, setOpen] = useState(false);
  const [profileMode, setProfileMode] = useState<ApprovalMode | null>(null);
  const [draft, setDraft] = useState<ApprovalMode>(effectiveMode);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    attempt.current += 1;
    setOpen(false);
    setProfileMode(null);
    setDraft(effectiveMode);
    setPending(false);
    setError(null);
  }, [scopeKey, effectiveMode]);

  const load = async () => {
    const id = ++attempt.current;
    const owner = scopeKey;
    setPending(true);
    setError(null);
    try {
      const mode = await read(profile, sessionId);
      if (id !== attempt.current || owner !== currentScope.current) return;
      setProfileMode(mode);
      setDraft(mode);
    } catch (reason) {
      if (id === attempt.current && owner === currentScope.current) setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (id === attempt.current && owner === currentScope.current) setPending(false);
    }
  };

  const submit = async () => {
    const id = ++attempt.current;
    const owner = scopeKey;
    setPending(true);
    setError(null);
    try {
      const verified = await save(profile, sessionId, draft);
      if (id !== attempt.current || owner !== currentScope.current) return;
      setProfileMode(verified);
      setDraft(verified);
    } catch (reason) {
      if (id === attempt.current && owner === currentScope.current) setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (id === attempt.current && owner === currentScope.current) setPending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        aria-label="Approval settings"
        aria-expanded={open}
        className="font-ui text-[var(--t-meta)] text-[var(--text-mid)] hover:text-[var(--text)]"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) void load();
        }}
      >
        {permissionLabel(effectiveMode)}
      </button>
      <AppDialog
        open={open}
        title="Approval settings"
        description={`Controls checks before flagged risky actions for ${profile}, including commands and plugin approvals. This setting applies to every session using this profile.`}
        onOpenChange={setOpen}
        className="w-[min(420px,calc(100vw-24px))]"
        footer={<>
          <Control size="sm" onClick={() => setOpen(false)}>Cancel</Control>
          <Control size="sm" variant="primary" disabled={pending || profileMode === null || draft === profileMode} onClick={() => void submit()}>{pending ? profileMode === null ? "Loading…" : "Saving…" : "Save"}</Control>
        </>}
      >
          <div className="grid gap-1.5" role="radiogroup" aria-label="Approval mode">
            {OPTIONS.map((option) => (
              <label key={option.mode} className="flex cursor-default items-start gap-2 rounded-[var(--r-ctl)] px-1 py-1 text-[var(--text)] hover:bg-[var(--surface-wash)]">
                <input type="radio" name={`approval-mode-${scopeKey}`} value={option.mode} checked={draft === option.mode} disabled={pending} onChange={() => setDraft(option.mode)} />
                <span className="min-w-0">
                  <span className="block font-ui text-[var(--t-section)]">{permissionLabel(option.mode)}</span>
                  <span className="block font-ui text-[var(--t-meta)] leading-snug text-[var(--text-mid)]">{option.detail}</span>
                </span>
              </label>
            ))}
          </div>
          {effectiveMode === "off" && profileMode !== null && profileMode !== "off" ? (
            <p className="mt-2 font-ui text-[var(--t-meta)] leading-snug text-[var(--text-mid)]">This session separately bypasses approvals. Saving here does not change that session-only bypass.</p>
          ) : null}
          {error ? <p role="alert" className="mt-2 font-ui text-[var(--t-meta)] text-[var(--bad)]">{error}</p> : null}
      </AppDialog>
    </>
  );
}
