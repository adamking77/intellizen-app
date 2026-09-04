// The editor modal, after hermes-app's `pages/Agents.tsx` Editor: identity
// column on the left (avatar, colour, voice), the operative fields on the
// right (name, role, model), then Identity (SOUL.md) and Context. Runtime
// routing stays with the agent configuration rather than leaking into this UI.

import { invoke } from "@tauri-apps/api/core";
import { open as pickFolder } from "@tauri-apps/plugin-dialog";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { tildify } from "@/components/layout/workspace-tree";
import { AppDialog } from "@/components/ui/app-dialog";
import { Pill } from "@/components/ui/status-pill";
import { errorMessage } from "@/lib/toast";
import { flavorById, loadTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

import {
  blankAgent,
  changed,
  ENGINES,
  engineLabel,
  isHermes,
  validProfileName,
  VOICE_SERVICES,
  type Agent,
  type AgentEngine,
  type AvatarStyle,
  type VoiceService,
} from "./agent-model";
import { previewVoice } from "./agents-data";
import { Avatar, BLOB_KINDS } from "./avatar";

function voiceLabel(service: VoiceService | undefined): string {
  return VOICE_SERVICES.find((s) => s.id === service)?.label ?? "the voice service";
}

const CAPS = "font-ui text-[var(--t-section)] font-light uppercase tracking-[0.16em] text-[var(--overlay-1)]";
const FIELD =
  "h-[var(--h-ctl)] w-full rounded-[var(--r-ctl)] border border-transparent bg-[var(--input)] px-[9px] font-ui text-[var(--t-ui)] text-[var(--text)] " +
  "placeholder:text-[var(--text-muted)] focus-visible:border-[var(--line-strong)]";
const PILL = "inline-flex h-[var(--h-ctl)] items-center justify-center rounded-[var(--r-ctl)] bg-[var(--raised)] px-2.5 font-ui text-[12.5px] text-[var(--text)] hover:shadow-[inset_0_0_0_999px_var(--hover)] disabled:opacity-[.45]";
const COMPACT_PILL = PILL;
const COMPACT_GROUP =
  "inline-flex items-center gap-0.5 rounded-[var(--r-ctl)] bg-[var(--crust)] p-0.5";

export interface AgentProviderOption {
  id: AgentEngine;
  label: string;
  available: boolean;
}

interface AgentModelOption {
  id: string;
  /** Hermes inference provider; empty for a CLI that runs as itself. */
  provider: string;
  group: string;
}

function modelValue(model: Pick<AgentModelOption, "id" | "provider">): string {
  return JSON.stringify([model.provider, model.id]);
}

export interface EditorProps {
  agent: Agent;
  creating: boolean;
  /** SOUL.md and the model pin arrive after the modal opens. */
  loadingDetail: boolean;
  detailError: string | null;
  image: string | null;
  defaultContext: string[];
  /** Installed/discovered runtimes. Existing agents retain their provider;
   *  new agents can choose any available one. */
  providers?: AgentProviderOption[];
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
  providers = ENGINES.map((engine) => ({ id: engine.id, label: engine.label, available: true })),
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
  const [previewLevel, setPreviewLevel] = useState(0);
  const [proceduralPreview, setProceduralPreview] = useState(false);
  const [models, setModels] = useState<AgentModelOption[] | null>(null);
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

  useEffect(() => {
    let live = true;
    setModels(null);
    void invoke<AgentModelOption[]>("agent_models", { provider: draft.engine })
      .then((found) => live && setModels(found))
      .catch(() => live && setModels([]));
    return () => {
      live = false;
    };
  }, [draft.engine]);

  const dirty = creating || proceduralPreview || changed(draft, agent);
  const hermes = isHermes(draft);
  const accents = flavorById(loadTheme().flavor).accents;
  const context = draft.context.length > 0 ? draft.context : defaultContext;
  const inherited = draft.context.length === 0;
  const name = draft.name.trim();
  const nameOk = name.length > 0 && (!hermes || !creating || validProfileName(name));
  const providerOptions = providers.some((provider) => provider.id === draft.engine)
    ? providers
    : [{ id: draft.engine, label: engineLabel(draft.engine), available: false }, ...providers];
  const selectedModel = (models ?? []).find(
    (model) => model.id === draft.model && (!hermes || model.provider === draft.provider),
  );
  const visibleModels = draft.model && !selectedModel
    ? [{ id: draft.model, provider: hermes ? draft.provider : "", group: "Current" }, ...(models ?? [])]
    : (models ?? []);
  const groupedModels = visibleModels.reduce<Record<string, AgentModelOption[]>>((groups, model) => {
    (groups[model.group] ??= []).push(model);
    return groups;
  }, {});
  const set = (patch: Partial<Agent>) => {
    setError(null);
    setConfirm(null);
    setDraft((d) => ({ ...d, ...patch }));
  };

  const chooseProvider = (engine: AgentEngine) => {
    const fresh = blankAgent(engine);
    set({ id: fresh.id, engine, provider: "", model: "" });
  };

  const save = async (confirmModel = false) => {
    if (!nameOk) return;
    setBusy(true);
    setError(null);
    try {
      await onSave({ ...draft, name, displayName: draft.displayName.trim() || name }, confirmModel);
      if (proceduralPreview && image) await onPickImage(null);
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
      void onPickImage(typeof reader.result === "string" ? reader.result : null)
        .then(() => setProceduralPreview(false))
        .catch((e) => setError(errorMessage(e)));
    };
    reader.readAsDataURL(f);
  };

  return (
    <AppDialog
      open
      title={creating ? "New agent" : "Edit agent"}
      onOpenChange={(open) => !open && onClose()}
      className="w-[min(588px,calc(100vw-24px))]"
      bodyClassName="p-0"
    >
            <div className="flex flex-col items-start gap-[18px] px-4 pt-5 sm:flex-row sm:px-[22px]">
              {/* Identity column: things the agent is. */}
              <div className="flex w-full shrink-0 flex-col items-center gap-2.5 sm:w-[168px]">
                <span className={CAPS}>Avatar</span>
                <Avatar
                  agent={draft}
                  size={76}
                  image={proceduralPreview ? null : image}
                  animate="always"
                  speaking={previewing ? previewLevel : undefined}
                />

                <div className={COMPACT_GROUP} role="group" aria-label="Avatar style">
                  {(["sphere", "blob"] as AvatarStyle[]).map((style) => (
                    <button
                      key={style}
                      type="button"
                      aria-selected={draft.avatarStyle === style}
                      className={COMPACT_PILL}
                      onClick={() => {
                        setProceduralPreview(true);
                        set({ avatarStyle: style, avatarKind: style === "blob" ? draft.avatarKind : undefined });
                      }}
                    >
                      {style === "sphere" ? "Sphere" : "Blob"}
                    </button>
                  ))}
                </div>

                {draft.avatarStyle === "blob" ? (
                  <div className="grid grid-cols-4 gap-1" aria-label="Blob silhouette">
                    <button
                      type="button"
                      title="Auto — the name decides"
                      aria-pressed={!draft.avatarKind}
                      onClick={() => {
                        setProceduralPreview(true);
                        set({ avatarKind: undefined });
                      }}
                      className="flex h-[38px] w-[38px] items-center justify-center rounded-[var(--r-ctl)] bg-transparent font-ui text-[var(--t-count)] text-[var(--text-muted)] hover:bg-[var(--hover)] aria-pressed:bg-[var(--selected)] aria-pressed:hover:bg-[var(--selected-hover)]"
                    >
                      Auto
                    </button>
                    {BLOB_KINDS.map((kind) => (
                      <button
                        key={kind}
                        type="button"
                        title={kind}
                        aria-label={`${kind} blob`}
                        aria-pressed={draft.avatarKind === kind}
                        onClick={() => {
                          setProceduralPreview(true);
                          set({ avatarKind: kind });
                        }}
                        className="flex h-[38px] w-[38px] items-center justify-center rounded-[var(--r-ctl)] bg-transparent hover:bg-[var(--hover)] aria-pressed:bg-[var(--selected)] aria-pressed:hover:bg-[var(--selected-hover)]"
                      >
                        <Avatar agent={{ ...draft, avatarStyle: "blob", avatarKind: kind }} size={26} animate={false} />
                      </button>
                    ))}
                  </div>
                ) : null}

                {hermes && !creating ? (
                  <div className={COMPACT_GROUP} role="group" aria-label="Avatar picture">
                    <button type="button" className={COMPACT_PILL} onClick={() => file.current?.click()}>
                      {image ? "Replace picture" : "Picture"}
                    </button>
                    {image ? (
                      <button
                        type="button"
                        className={COMPACT_PILL}
                        onClick={() =>
                          void onPickImage(null)
                            .then(() => setProceduralPreview(false))
                            .catch((e) => setError(errorMessage(e)))
                        }
                      >
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
                    onClick={() => {
                      setProceduralPreview(true);
                      set({ avatarColor: undefined });
                    }}
                    className="h-5 w-5 rounded-[var(--r-pill)] bg-[var(--mantle)] font-ui text-[var(--t-count)] text-[var(--text-muted)] transition-colors hover:bg-[var(--raised)]"
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
                      onClick={() => {
                        setProceduralPreview(true);
                        set({ avatarColor: a.hex });
                      }}
                      className="swatch h-5 w-5 rounded-[var(--r-pill)]"
                      style={{
                        background: a.hex,
                        boxShadow: draft.avatarColor === a.hex ? "inset 0 0 0 2px var(--raised), inset 0 0 0 4px var(--text)" : undefined,
                      }}
                    />
                  ))}
                </div>
                <span className="text-center font-ui text-[var(--t-meta)] leading-[1.4] text-[var(--text-muted)]">
                  {image && !proceduralPreview
                    ? "Picture override. Choose Sphere or Blob to replace it when you save."
                    : draft.avatarKind || draft.avatarColor
                      ? "Procedural avatar pinned."
                      : "Drawn from the name."}
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
                    className={cn(FIELD, "font-mono text-[var(--t-meta)]")}
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
                        previewVoice(`Hello, I am ${name || "your agent"}.`, draft.voiceService, draft.voiceId, setPreviewLevel)
                          .catch((e) => setError(errorMessage(e)))
                          .finally(() => setPreviewing(false));
                      }}
                    >
                      {previewing ? "Speaking…" : "Preview"}
                    </button>
                    <span className="font-ui text-[var(--t-meta)] leading-[1.4] text-[var(--text-muted)]">
                      {draft.voiceId ? `From ${voiceLabel(draft.voiceService)}.` : "No voice yet."}
                    </span>
                  </div>
                </div>
              </div>

              {/* Operative fields. */}
              <div className="flex min-w-0 grow flex-col gap-[13px]">
                <div className="flex items-center">
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
                  <span className="font-ui text-[var(--t-meta)] text-[var(--wait)]">A profile name is a lowercase slug: letters, digits, - and _.</span>
                ) : null}

                <div className="flex flex-col gap-1">
                  <span className={CAPS}>Role</span>
                  <input className={cn(FIELD, "text-[var(--text-muted)]")} value={draft.role} onChange={(e) => set({ role: e.target.value })} />
                </div>

                <div className="grid grid-cols-2 gap-[11px]">
                  <div className="flex flex-col gap-1">
                    <span className={CAPS}>Provider</span>
                    <select
                      className={cn(FIELD, "px-[10px] py-2")}
                      value={draft.engine}
                      disabled={!creating}
                      title={creating ? undefined : "An agent keeps its provider; make a new one to move it."}
                      onChange={(event) => chooseProvider(event.target.value as AgentEngine)}
                    >
                      {providerOptions.map((provider) => (
                        <option key={provider.id} value={provider.id} disabled={!provider.available && provider.id !== draft.engine}>
                          {provider.label}{provider.available || provider.id === draft.engine ? "" : " (not connected)"}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className={CAPS}>Model</span>
                    {loadingDetail || models === null ? (
                      <div className={cn(FIELD, "px-[10px] py-2 text-[var(--text-muted)]")}>Reading…</div>
                    ) : (
                      <select
                        className={cn(FIELD, "px-[10px] py-2 font-mono text-[var(--t-meta)]")}
                        aria-label="Model"
                        value={selectedModel ? modelValue(selectedModel) : draft.model ? modelValue(visibleModels[0]!) : ""}
                        onChange={(event) => {
                          if (!event.target.value) return set({ model: "", provider: "" });
                          const [provider, model] = JSON.parse(event.target.value) as [string, string];
                          set({ model, provider: hermes ? provider : "" });
                        }}
                      >
                        <option value="">{visibleModels.length ? "Choose a model…" : "No models found"}</option>
                        {Object.entries(groupedModels).map(([group, options]) =>
                          group ? (
                            <optgroup key={group} label={group}>
                              {options.map((model) => (
                                <option key={modelValue(model)} value={modelValue(model)}>{model.id}</option>
                              ))}
                            </optgroup>
                          ) : options.map((model) => (
                            <option key={modelValue(model)} value={modelValue(model)}>{model.id}</option>
                          )),
                        )}
                      </select>
                    )}
                  </div>
                </div>

                {detailError ? (
                  <div className="rounded-[var(--r-ctl)] border border-[var(--bad)] bg-[color-mix(in_srgb,var(--bad)_11%,transparent)] px-[10px] py-2 font-ui text-[var(--t-meta)] text-[var(--bad)]">
                    Hermes did not describe this profile — {detailError}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex flex-col gap-[13px] px-[22px] pt-4">
              <div className="flex flex-col gap-[7px]">
                <div className="flex items-baseline gap-2">
                  <span className={CAPS}>Identity</span>
                  <span className="font-ui text-[var(--t-meta)] text-[var(--text-muted)]">voice, judgement, what it will not do</span>
                  <div className="grow" />
                  <span className="font-mono text-[var(--t-section)] text-[var(--text-muted)]">SOUL.md</span>
                </div>
                <textarea
                  className={cn(FIELD, "h-auto min-h-0 resize-y px-[11px] py-2.5 leading-[1.55]")}
                  rows={5}
                  value={draft.identity}
                  disabled={loadingDetail}
                  onChange={(e) => set({ identity: e.target.value })}
                />
                <span className="font-ui text-[var(--t-meta)] text-[var(--text-muted)]">
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
                  <span className="font-ui text-[var(--t-meta)] text-[var(--text-muted)]">{inherited ? "inheriting the default" : "overrides the default"}</span>
                  {!inherited ? (
                    <button type="button" className={PILL} style={{ padding: "2px 9px", fontSize: 11 }} onClick={() => set({ context: [] })}>
                      Reset
                    </button>
                  ) : null}
                </div>
                <div className="flex flex-col gap-px">
                  {context.map((path) => (
                    <div key={path} className="flex items-center gap-[9px] rounded-[var(--r-ctl)] bg-[var(--input)] px-[10px] py-2">
                      <span className="grow truncate font-mono text-[var(--t-meta)] text-[var(--text)]">{path}</span>
                      <Pill>read</Pill>
                      <button type="button" className={PILL} style={{ padding: "2px 7px" }} title={`Remove ${path}`} onClick={() => set({ context: context.filter((p) => p !== path) })}>
                        <X size={12} strokeWidth={1.9} aria-hidden />
                      </button>
                    </div>
                  ))}
                  {context.length === 0 ? (
                    <span className="px-0.5 py-2 font-ui text-[var(--t-meta)] text-[var(--text-muted)]">
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
              <div className="mx-[22px] mt-4 flex items-center gap-3 rounded-[var(--r-ctl)] border border-[var(--wait)] bg-[color-mix(in_srgb,var(--wait)_11%,transparent)] px-[10px] py-2">
                <span className="grow font-ui text-[var(--t-meta)] text-[var(--wait)]">{confirm}</span>
                <button type="button" className={PILL} disabled={busy} onClick={() => void save(true)}>
                  Use it anyway
                </button>
              </div>
            ) : null}
            {error ? (
              <div className="mx-[22px] mt-4 rounded-[var(--r-ctl)] border border-[var(--bad)] bg-[color-mix(in_srgb,var(--bad)_11%,transparent)] px-[10px] py-2 font-ui text-[var(--t-meta)] text-[var(--bad)]">
                {error}
              </div>
            ) : null}

            <div className="sticky bottom-0 z-10 flex items-center gap-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[var(--raised)] px-[22px] pb-5 pt-[18px]">
              {!creating ? (
                <button
                  type="button"
                  className="h-[var(--h-ctl)] rounded-[var(--r-ctl)] bg-[color-mix(in_srgb,var(--bad)_18%,transparent)] px-2.5 font-ui text-[12.5px] text-[var(--bad)]"
                  disabled={busy}
                  onClick={() => onDelete(draft)}
                >
                  Delete
                </button>
              ) : null}
              <div className="grow" />
              {creating && !name ? <span className="font-ui text-[var(--t-meta)] text-[var(--text-muted)]">A name is needed — the avatar is drawn from it.</span> : null}
              <button type="button" className={PILL} onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button
                type="button"
                disabled={!nameOk || !dirty || busy || loadingDetail}
                className={cn(
                  "h-[var(--h-ctl)] rounded-[var(--r-ctl)] px-3 font-ui text-[12.5px] transition-colors disabled:opacity-[.45]",
                  dirty ? "bg-[var(--go-bg)] text-[var(--go-fg)]" : "bg-[var(--raised)] text-[var(--text)]",
                )}
                onClick={() => void save(false)}
              >
                {busy ? "Saving…" : creating ? "Create" : "Save"}
              </button>
            </div>
    </AppDialog>
  );
}
