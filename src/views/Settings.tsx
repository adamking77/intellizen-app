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
    <div className="subshell h-full bg-[var(--base)]">
      <aside className="subpane flex w-[clamp(168px,15vw,210px)] shrink-0 flex-col gap-0.5 bg-[var(--mantle)] p-[14px]">
        <span className="block px-0.5 pb-2 font-ui text-[var(--t-count)] font-light uppercase tracking-[0.14em] text-[var(--overlay-1)]">Settings</span>
        <nav className="flex flex-col gap-0.5" aria-label="Settings sections" role="tablist" aria-orientation="vertical">
          {SECTIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              id={`settings-tab-${item.id}`}
              role="tab"
              aria-controls="settings-panel"
              onClick={() => setParams({ section: item.id }, { replace: true })}
              aria-selected={section === item.id}
              className="nav-node px-[11px] py-[9px] text-left"
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="subpane relative flex min-w-0 flex-1 flex-col overflow-hidden bg-[var(--base)]">
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-1 pt-5">
          <div id="settings-panel" role="tabpanel" aria-labelledby={`settings-tab-${section}`} className="flex max-w-[880px] flex-col gap-2">
          {section === "providers" ? <ProvidersSettings /> : null}
          {section === "capabilities" ? <CapabilitiesSettings engineOpen={engineOpen} /> : null}
          {section === "context" ? <ContextSettings /> : null}
          {section === "voice" ? <VoiceSettings /> : null}
          {section === "appearance" ? <AppearanceSection /> : null}
          {section === "general" ? <GeneralSettings /> : null}
          </div>
        </div>
      </main>
    </div>
  );
}
