import { useSearchParams } from "react-router-dom";

import { AppearanceSection } from "@/components/settings/appearance";
import { CapabilitiesSettings } from "@/components/settings/capabilities";
import { ContextSettings } from "@/components/settings/context";
import { GeneralSettings } from "@/components/settings/general";
import { ProvidersSettings } from "@/components/settings/providers";
import { VoiceSettings } from "@/components/settings/voice-settings";
import { useEngineStore } from "@/engine/engine-store";

const SECTIONS = [
  { id: "providers", label: "Providers" },
  { id: "capabilities", label: "Capabilities" },
  { id: "context", label: "Context" },
  { id: "voice", label: "Voice" },
  { id: "appearance", label: "Appearance" },
  { id: "general", label: "General" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

export function SettingsView() {
  const [params, setParams] = useSearchParams();
  const requested = params.get("section") as SectionId | null;
  const section = SECTIONS.some((item) => item.id === requested) ? requested! : "providers";
  const engineOpen = useEngineStore((state) => state.connection === "open");

  return (
    <div className="flex h-full min-h-0 bg-[var(--base)]">
      <aside className="w-52 shrink-0 border-r border-[var(--border)] bg-[var(--mantle)] px-3 py-5">
        <span className="mb-2 block px-2 font-ui text-[var(--t-count)] font-light uppercase tracking-[0.14em] text-[var(--overlay-1)]">Settings</span>
        <nav className="flex flex-col gap-0.5" aria-label="Settings sections">
          {SECTIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setParams({ section: item.id }, { replace: true })}
              aria-selected={section === item.id}
              className="nav-node focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]"
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto px-7 py-6">
        <div className="mx-auto max-w-5xl">
          {section === "providers" ? <ProvidersSettings /> : null}
          {section === "capabilities" ? <CapabilitiesSettings engineOpen={engineOpen} /> : null}
          {section === "context" ? <ContextSettings /> : null}
          {section === "voice" ? <VoiceSettings /> : null}
          {section === "appearance" ? <AppearanceSection /> : null}
          {section === "general" ? <GeneralSettings /> : null}
        </div>
      </main>
    </div>
  );
}
