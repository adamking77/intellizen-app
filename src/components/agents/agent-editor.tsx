// The editor modal, after hermes-app's `pages/Agents.tsx` Editor: identity
// column on the left (avatar, colour, voice), the operative fields on the
// right (name, role, engine, model), then Identity (SOUL.md) and Context.

import { Dialog } from "@base-ui/react/dialog";
import { open as pickFolder } from "@tauri-apps/plugin-dialog";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { tildify } from "@/components/layout/workspace-tree";
import { errorMessage } from "@/lib/toast";
import { flavorById, loadTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

import { changed, ENGINES, isHermes, validProfileName, VOICE_SERVICES, type Agent, type AgentEngine, type VoiceService } from "./agent-model";
import { previewVoice } from "./agents-data";
import { Avatar } from "./avatar";

function voiceLabel(service: VoiceService | undefined): string {
  return VOICE_SERVICES.find((s) => s.id === service)?.label ?? "the voice service";
}

const CAPS = "font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]";
const FIELD =
  "w-full rounded-[var(--r-row)] border-0 bg-[var(--input)] px-[9px] py-[7px] font-ui text-[13px] text-[var(--text)] " +
  "placeholder:text-[var(--overlay-0)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-border)]";
const PILL = "pill";

export interface EditorProps {
  agent: Agent;
  creating: boolean;
  /** SOUL.md and the model pin arrive after the modal opens. */
  loadingDetail: boolean;
  detailError: string | null;
  image: string | null;
  defaultContext: string[];
  /** Resolves when written; rejects with the reason. `confirmModel` resends a
   *  pin Hermes asked to confirm. */
  onSave: (draft: Agent, confirmModel: boolean) => Promise<void>;
  onDelete: (agent: Agent) => void;
  onPickImage: (dataUrl: string | null) => Promise<void>;
  onClose: () => void;
}

export function AgentEditor({
  agent,
  creating,
  loadingDetail,
  detailError,
  image,
  defaultContext,
  onSave,
  onDelete,
  onPickImage,
  onClose,
}: EditorProps) {
  const [draft, setDraft] = useState<Agent>(agent);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  // The detail read lands after mount; take it once, without clobbering
  // what the person has already typed.
  useEffect(() => {
    setDraft((d) => ({
      ...d,
      identity: agent.identity,
      provider: agent.provider,
      model: agent.model,
      voiceId: agent.voiceId,
      voiceService: agent.voiceService,
    }));
  }, [agent.identity, agent.provider, agent.model, agent.voiceId, agent.voiceService]);

  const dirty = creating || changed(draft, agent);
  const hermes = isHermes(draft);
  const accents = flavorById(loadTheme().flavor).accents;
  const context = draft.context.length > 0 ? draft.context : defaultContext;
  const inherited = draft.context.length === 0;
  const name = draft.name.trim();
  const nameOk = name.length > 0 && (!hermes || !creating || validProfileName(name));
  const set = (patch: Partial<Agent>) => {
    setError(null);
    setConfirm(null);
    setDraft((d) => ({ ...d, ...patch }));
  };

  const save = async (confirmModel = false) => {
    if (!nameOk) return;
    setBusy(true);
    setError(null);
    try {
      await onSave({ ...draft, name, displayName: draft.displayName.trim() || name }, confirmModel);
      onClose();
    } catch (e) {
      if (e instanceof Error && e.name === "ModelConfirmRequired") setConfirm(e.message);
      else setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const addFolder = async () => {
    setPicking(true);
    try {
      const p = await pickFolder({ directory: true, multiple: false });
      if (typeof p !== "string" || !p) return;
      const tidy = tildify(p.replace(/\/$/, ""));
      if (!context.includes(tidy)) set({ context: [...context, tidy] });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPicking(false);
    }
  };

  const chooseImage = (f: File | undefined) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      void onPickImage(typeof reader.result === "string" ? reader.result : null).catch((e) => setError(errorMessage(e)));
    };
    reader.readAsDataURL(f);
  };

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[120] bg-[color-mix(in_srgb,var(--crust)_42%,transparent)] backdrop-blur-[7px]" />
        <Dialog.Viewport className="fixed inset-0 z-[121] flex items-center justify-center">
          <Dialog.Popup
            aria-label={creating ? "New agent" : "Edit agent"}
            className="flex max-h-[86%] w-[588px] flex-col overflow-y-auto rounded-xl bg-[var(--raised)] outline-none shadow-[0_40px_120px_color-mix(in_srgb,var(--crust)_55%,transparent)]"
          >
            <div className="flex items-start gap-[18px] px-[22px] pt-5">
              {/* Identity column: things the agent is. */}
              <div className="flex w-[168px] shrink-0 flex-col items-center gap-2.5">
                <Avatar agent={draft} size={76} image={image} />

                {hermes && !creating ? (
                  <div className="flex gap-[3px] rounded-full bg-[color-mix(in_srgb,var(--text)_8%,transparent)] p-[3px]">
                    <button type="button" className={PILL} style={{ padding: "4px 12px", fontSize: 11 }} onClick={() => file.current?.click()}>
                      {image ? "Replace picture" : "Picture"}
                    </button>
                    {image ? (
                      <button type="button" className={PILL} style={{ padding: "4px 12px", fontSize: 11 }} onClick={() => void onPickImage(null).catch((e) => setError(errorMessage(e)))}>
                        Remove
                      </button>
                    ) : null}
                    <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => chooseImage(e.target.files?.[0])} />
                  </div>
                ) : null}

                <div className="flex flex-wrap justify-center gap-[5px]">
                  <button
                    type="button"
                    title="Auto — the name decides"
                    onClick={() => set({ avatarColor: undefined })}
                    className="h-5 w-5 rounded-full bg-[var(--mantle)] font-ui text-[10px] text-[var(--text-muted)]"
                    style={{ boxShadow: !draft.avatarColor ? "inset 0 0 0 2px var(--raised), inset 0 0 0 4px var(--text)" : undefined }}
                  >
                    A
                  </button>
                  {accents.map((a) => (
                    <button
                      key={a.name}
                      type="button"
                      title={a.name}
                      aria-label={a.name}
                      aria-pressed={draft.avatarColor === a.hex}
                      onClick={() => set({ avatarColor: a.hex })}
                      className="h-5 w-5 rounded-full"
                      style={{
                        background: a.hex,
                        boxShadow: draft.avatarColor === a.hex ? "inset 0 0 0 2px var(--raised), inset 0 0 0 4px var(--text)" : undefined,
                      }}
                    />
                  ))}
                </div>
                <span className="text-center font-ui text-[12px] leading-[1.4] text-[var(--text-muted)]">
                  {image ? "A picture." : draft.avatarColor ? "Pinned." : "Drawn from the name."}
                </span>

                {/* Voice, at the foot of the identity column: something the
                    agent is, beside its colour, not something about how it
                    runs. Service and id, because a cloned voice has an id no
                    list could hold. */}
                <div className="mt-1 flex w-full flex-col gap-1">
                  <span className={CAPS}>Voice</span>
                  <select
                    className={FIELD}
                    value={draft.voiceService ?? "minimax"}
                    aria-label="Voice service"
                    disabled={loadingDetail}
                    onChange={(e) => set({ voiceService: e.target.value as VoiceService })}
                  >
                    {VOICE_SERVICES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <input
                    className={cn(FIELD, "font-mono text-[12px]")}
                    value={draft.voiceId ?? ""}
                    placeholder="Voice id"
                    aria-label="Voice id"
                    disabled={loadingDetail}
                    onChange={(e) => {
                      const voiceId = e.target.value.trim();
                      set({ voiceId: voiceId || undefined, voiceService: draft.voiceService ?? "minimax" });
                    }}
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className={PILL}
                      style={{ padding: "3px 10px", fontSize: 11 }}
                      disabled={previewing || loadingDetail}
                      onClick={() => {
                        setPreviewing(true);
                        setError(null);
                        previewVoice(`Hello, I am ${name || "your agent"}.`, draft.voiceService, draft.voiceId)
                          .catch((e) => setError(errorMessage(e)))
                          .finally(() => setPreviewing(false));
                      }}
                    >
                      {previewing ? "Speaking…" : "Preview"}
                    </button>
                    <span className="font-ui text-[12px] leading-[1.4] text-[var(--text-muted)]">
                      {draft.voiceId ? `From ${voiceLabel(draft.voiceService)}.` : "No voice yet."}
                    </span>
                  </div>
                </div>
              </div>

              {/* Operative fields. */}
              <div className="flex min-w-0 grow flex-col gap-[13px]">
                <div className="flex items-center">
                  <Dialog.Title className={CAPS}>{creating ? "New agent" : "Edit agent"}</Dialog.Title>
                  <div className="grow" />
                  <button type="button" className={PILL} style={{ padding: "2px 8px" }} onClick={onClose} aria-label="Close">
                    <X size={16} strokeWidth={1.8} aria-hidden />
                  </button>
                </div>

                <input
                  className={FIELD}
                  autoFocus={creating}
                  placeholder={hermes ? "profile-name" : "Agent name"}
                  value={draft.name}
                  readOnly={hermes && !creating}
                  title={hermes && !creating ? "A profile keeps its name; make a new one to rename." : undefined}
                  onChange={(e) => set({ name: e.target.value, displayName: hermes ? draft.displayName : e.target.value })}
                />
                {hermes && creating && name && !validProfileName(name) ? (
                  <span className="font-ui text-[12px] text-[var(--wait)]">A profile name is a lowercase slug: letters, digits, - and _.</span>
                ) : null}

                <div className="flex flex-col gap-1">
                  <span className={CAPS}>Role</span>
                  <input className={cn(FIELD, "text-[var(--text-muted)]")} value={draft.role} onChange={(e) => set({ role: e.target.value })} />
                </div>

                <div className="grid grid-cols-2 gap-[11px]">
                  <div className="flex flex-col gap-1">
                    <span className={CAPS}>Engine</span>
                    <select
                      className={cn(FIELD, "px-[10px] py-2")}
                      value={draft.engine}
                      disabled={!creating}
                      title={creating ? undefined : "An agent keeps its engine; make a new one to move it."}
                      onChange={(e) => set({ engine: e.target.value as AgentEngine, model: "", provider: "" })}
                    >
                      {ENGINES.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className={CAPS}>Model</span>
                    {loadingDetail ? (
                      <div className={cn(FIELD, "px-[10px] py-2 text-[var(--text-muted)]")}>Reading…</div>
                    ) : (
                      <input
                        className={cn(FIELD, "px-[10px] py-2 font-mono text-[12px]")}
                        value={draft.model}
                        placeholder={hermes ? "model id" : "model id (optional)"}
                        onChange={(e) => set({ model: e.target.value })}
                      />
                    )}
                  </div>
                </div>
                {hermes ? (
                  <div className="flex flex-col gap-1">
                    <span className={CAPS}>Provider</span>
                    <input
                      className={cn(FIELD, "px-[10px] py-2 font-mono text-[12px]")}
                      value={draft.provider}
                      placeholder={creating ? "inherits the launch profile's" : "provider id"}
                      onChange={(e) => set({ provider: e.target.value })}
                    />
                    <span className="font-ui text-[12px] leading-[1.4] text-[var(--text-muted)]">
                      Provider and model are pinned together, or not at all.
                    </span>
                  </div>
                ) : null}

                {detailError ? (
                  <div className="rounded-[var(--r-row)] border border-[var(--bad)] bg-[color-mix(in_srgb,var(--bad)_11%,transparent)] px-[10px] py-2 font-ui text-[12px] text-[var(--bad)]">
                    Hermes did not describe this profile — {detailError}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex flex-col gap-[13px] px-[22px] pt-4">
              <div className="flex flex-col gap-[7px]">
                <div className="flex items-baseline gap-2">
                  <span className={CAPS}>Identity</span>
                  <span className="font-ui text-[12px] text-[var(--text-muted)]">voice, judgement, what it will not do</span>
                  <div className="grow" />
                  <span className="font-mono text-[11px] text-[var(--text-muted)]">SOUL.md</span>
                </div>
                <textarea
                  className={cn(FIELD, "min-h-0 resize-y px-[11px] py-2.5 leading-[1.55]")}
                  rows={5}
                  value={draft.identity}
                  disabled={loadingDetail}
                  onChange={(e) => set({ identity: e.target.value })}
                />
                <span className="font-ui text-[12px] text-[var(--text-muted)]">
                  {hermes ? (
                    <>
                      Saves to the profile's own <span className="font-mono">SOUL.md</span> through the gateway.
                    </>
                  ) : (
                    "Saves to the ACP registry entry."
                  )}
                </span>
              </div>

              <div className="flex flex-col gap-[7px]">
                <div className="flex items-baseline gap-2">
                  <span className={CAPS}>Context</span>
                  <div className="grow" />
                  <span className="font-ui text-[12px] text-[var(--text-muted)]">{inherited ? "inheriting the default" : "overrides the default"}</span>
                  {!inherited ? (
                    <button type="button" className={PILL} style={{ padding: "2px 9px", fontSize: 11 }} onClick={() => set({ context: [] })}>
                      Reset
                    </button>
                  ) : null}
                </div>
                <div className="flex flex-col gap-px">
                  {context.map((path) => (
                    <div key={path} className="flex items-center gap-[9px] rounded-[var(--r-row)] bg-[var(--input)] px-[10px] py-2">
                      <span className="grow truncate font-mono text-[12px] text-[var(--text)]">{path}</span>
                      <span className="rounded-full bg-[color-mix(in_srgb,var(--text)_10%,transparent)] px-2 py-px font-ui text-[11px] text-[var(--subtext-0)]">read</span>
                      <button type="button" className={PILL} style={{ padding: "2px 7px" }} title={`Remove ${path}`} onClick={() => set({ context: context.filter((p) => p !== path) })}>
                        <X size={12} strokeWidth={1.9} aria-hidden />
                      </button>
                    </div>
                  ))}
                  {context.length === 0 ? (
                    <span className="px-0.5 py-2 font-ui text-[12px] text-[var(--text-muted)]">
                      No folders — this agent sees only what it is told in the prompt.
                    </span>
                  ) : null}
                </div>
                <div>
                  <button type="button" className={PILL} style={{ padding: "3px 10px", fontSize: 11 }} disabled={picking} onClick={() => void addFolder()}>
                    {picking ? "Choosing…" : "+ Add folder"}
                  </button>
                </div>
              </div>
            </div>

            {confirm ? (
              <div className="mx-[22px] mt-4 flex items-center gap-3 rounded-[var(--r-row)] border border-[var(--wait)] bg-[color-mix(in_srgb,var(--wait)_11%,transparent)] px-[10px] py-2">
                <span className="grow font-ui text-[12px] text-[var(--wait)]">{confirm}</span>
                <button type="button" className={PILL} disabled={busy} onClick={() => void save(true)}>
                  Use it anyway
                </button>
              </div>
            ) : null}
            {error ? (
              <div className="mx-[22px] mt-4 rounded-[var(--r-row)] border border-[var(--bad)] bg-[color-mix(in_srgb,var(--bad)_11%,transparent)] px-[10px] py-2 font-ui text-[12px] text-[var(--bad)]">
                {error}
              </div>
            ) : null}

            <div className="sticky bottom-0 z-10 flex items-center gap-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[var(--raised)] px-[22px] pb-5 pt-[18px]">
              {!creating ? (
                <button
                  type="button"
                  className="rounded-full px-3.5 py-1.5 font-ui text-[12px] text-[var(--bad)] hover:bg-[color-mix(in_srgb,var(--bad)_12%,transparent)]"
                  disabled={busy}
                  onClick={() => onDelete(draft)}
                >
                  Delete
                </button>
              ) : null}
              <div className="grow" />
              {creating && !name ? <span className="font-ui text-[12px] text-[var(--text-muted)]">A name is needed — the avatar is drawn from it.</span> : null}
              <button type="button" className={PILL} onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button
                type="button"
                disabled={!nameOk || !dirty || busy || loadingDetail}
                className={cn(
                  "rounded-full px-3.5 py-1.5 font-ui text-[12px] transition-colors disabled:opacity-45",
                  dirty ? "bg-[var(--accent)] text-[var(--crust)] hover:bg-[var(--accent-hover)]" : "bg-[color-mix(in_srgb,var(--text)_8%,transparent)] text-[var(--text)]",
                )}
                onClick={() => void save(false)}
              >
                {busy ? "Saving…" : creating ? "Create" : "Save"}
              </button>
            </div>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
