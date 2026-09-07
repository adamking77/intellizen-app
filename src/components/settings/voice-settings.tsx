/** Speaking and listening — hermes-app's `pages/Voice.tsx`, screen for screen.
 *
 *  Two independent halves, both live: the composer's microphone records and
 *  transcribes through `voice_transcribe`, and a reply is prepared through
 *  `voice_prepare` for frontend playback. "Service", never "Provider": that word already names the
 *  thing that runs an agent. */

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useVoicePrefs, type SpeechService } from "@/voice/voice-prefs";

import { SettingSwitch } from "./setting-switch";
import { SETTINGS_TITLE } from "./settings-style";

interface Catalog {
  id: string;
  label: string;
  models: string[];
  needsKey: boolean;
}

/** `local` is the only dictation service with code behind it. Its models are
 *  read from the machine at open (`voice_models`): what is on disk is a fact. */
const DICTATION_SERVICES: Catalog[] = [{ id: "local", label: "On this Mac", models: [], needsKey: false }];

/** MiniMax is what `voice_prepare` implements. `speech-02-hd` first: it is the
 *  model Hermes's own profiles speak through. The key comes from
 *  `MINIMAX_API_KEY` in `~/.hermes/.env`, so it needs no field of its own. */
const SPEAKING_SERVICES: Catalog[] = [
  { id: "minimax", label: "MiniMax", models: ["speech-02-hd", "speech-02-turbo"], needsKey: false },
];

const caps = "font-mono text-[9.5px] font-normal uppercase tracking-[0.08em] text-[var(--text-muted)]";
const meta = "font-ui text-[length:var(--t-section)] leading-[1.45] text-[var(--text-muted)]";

function Row({ label, detail, children }: { label: string; detail: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 border-b border-[var(--hair)] px-0.5 py-3">
      <div className="flex min-w-0 grow flex-col gap-[3px]">
        <span className="font-ui text-[length:var(--t-ui)] text-[var(--text)]">{label}</span>
        <span className={meta}>{detail}</span>
      </div>
      {children}
    </div>
  );
}

/** One half of the voice settings. Both halves are the same shape. */
function Half({
  title,
  explain,
  value,
  catalog,
  found,
  language = false,
  onChange,
}: {
  title: string;
  explain: string;
  value: SpeechService;
  catalog: Catalog[];
  /** Models discovered on this machine, when the chosen service has any. */
  found?: { id: string; label: string }[];
  language?: boolean;
  onChange: (next: SpeechService) => void;
}) {
  const chosen = catalog.find((p) => p.id === value.service);
  const custom = value.service !== "" && !chosen;
  const needsKey = chosen?.needsKey ?? custom;
  const options = chosen && chosen.models.length > 0 ? chosen.models.map((m) => ({ id: m, label: m })) : (found ?? []);

  return (
    <section className="flex flex-col">
      <Row label={title} detail={explain}>
        <SettingSwitch on={value.enabled} label={`${title}, ${value.enabled ? "on" : "off"}`} onToggle={() => onChange({ ...value, enabled: !value.enabled })} />
      </Row>

      {value.enabled ? (
        <div className="flex flex-col gap-2.5 px-0.5 pb-1 pt-3">
          <label className="flex flex-col gap-1">
            <span className={caps}>Service</span>
            <Select
              controlSize="sm"
              value={custom ? "custom" : value.service}
              onChange={(e) => {
                // Changing service clears the model: one service's model id
                // means nothing to another.
                const next = e.target.value;
                onChange({ ...value, service: next === "custom" ? " " : next, model: "" });
              }}
            >
              <option value="">Not set</option>
              {catalog.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
              <option value="custom">Something else…</option>
            </Select>
          </label>

          {custom ? (
            <label className="flex flex-col gap-1">
              <span className={caps}>Service id</span>
              <Input className="h-8 text-[length:var(--t-meta)]" value={value.service.trim()} placeholder="elevenlabs" onChange={(e) => onChange({ ...value, service: e.target.value || " " })} />
              <span className={meta}>
                Custom services are saved for future use. Only {catalog.map((p) => p.label).join(" and ")} {title === "Speaking" ? "can speak" : "works for dictation"} in the current app.
              </span>
            </label>
          ) : null}

          {chosen || custom ? (
            <label className="flex flex-col gap-1">
              <span className={caps}>{title === "Speaking" ? "Voice" : "Model"}</span>
              {chosen ? (
                <Select controlSize="sm" value={value.model} onChange={(e) => onChange({ ...value, model: e.target.value })}>
                  <option value="">{options.length === 0 ? "Nothing installed" : "Choose…"}</option>
                  {options.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input className="h-8 text-[length:var(--t-meta)]" value={value.model} placeholder="Model id" onChange={(e) => onChange({ ...value, model: e.target.value })} />
              )}
            </label>
          ) : null}

          {language ? (
            <label className="flex flex-col gap-1">
              <span className={caps}>Language</span>
              <Input
                className="h-8 text-[length:var(--t-meta)]"
                value={value.language}
                placeholder="en"
                onChange={(e) => onChange({ ...value, language: e.target.value })}
              />
              <span className={meta}>ISO language code, such as en, es, fr or de. Parakeet supports English only.</span>
            </label>
          ) : null}

          {needsKey ? (
            <label className="flex flex-col gap-1">
              <span className={caps}>API key</span>
              <Input className="h-8 text-[length:var(--t-meta)]" type="password" value={value.apiKey} placeholder="Read from the environment" onChange={(e) => onChange({ ...value, apiKey: e.target.value })} />
              <span className={meta}>
                The app reads credentials from the service’s environment variable. A key entered here is saved but is not used yet.
              </span>
            </label>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function VoiceSettings() {
  const voice = useVoicePrefs((s) => s.voice);
  const setVoice = useVoicePrefs((s) => s.setVoice);
  // What is actually installed, asked once when the page opens.
  const [found, setFound] = useState<{ id: string; label: string }[]>([]);
  useEffect(() => {
    void invoke<{ id: string; label: string }[]>("voice_models")
      .then(setFound)
      .catch(() => setFound([]));
  }, []);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className={SETTINGS_TITLE}>Voice</h1>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-[var(--subtext-0)]">Choose the local dictation model and the service agents use to read replies aloud.</p>
      </div>
      <div className="flex items-start rounded-[var(--r-plane)] bg-[var(--input)] px-3 py-[9px]">
        <span className={cn(meta, "leading-[1.5]")}>
          Dictation uses a model installed on this Mac. Speaking uses the service you choose below.
        </span>
      </div>

      <Half
        title="Dictation"
        explain="Choose the model that turns microphone audio into text in the composer."
        value={voice.dictation}
        catalog={DICTATION_SERVICES}
        found={found}
        language
        onChange={(dictation) => setVoice({ ...voice, dictation })}
      />

      <Half
        title="Speaking"
        explain="Choose the service and voice agents use to read replies aloud."
        value={voice.speaking}
        catalog={SPEAKING_SERVICES}
        onChange={(speaking) => setVoice({ ...voice, speaking })}
      />
    </div>
  );
}
