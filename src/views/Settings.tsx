import { useEffect, useRef, useState } from "react";
import { Drawer } from "@/components/ui/drawer";
import { useSearchParams } from "react-router-dom";

import { AppearanceSection } from "@/components/settings/appearance";
import { CollapsibleRail } from "@/components/layout/collapsible-rail";
import { CollapsedRailTrigger } from "@/components/layout/collapsed-rail-trigger";
import { ActivityDashboard } from "@/components/activity/activity-dashboard";
import { cn } from "@/lib/utils";
import { usePreference } from "@/lib/settings-preferences";
import { CapabilitiesSettings } from "@/components/settings/capabilities";
import { ContextSettings } from "@/components/settings/context";
import { GeneralSettings } from "@/components/settings/general";
import { ProvidersSettings } from "@/components/settings/providers";
import { PluginsSettings } from "@/components/settings/plugins";
import { VoiceSettings } from "@/components/settings/voice-settings";
import { useEngineStore } from "@/engine/engine-store";

const SECTIONS = [
  { id: "providers", label: "Providers" },
  { id: "capabilities", label: "Capabilities" },
  { id: "plugins", label: "Plugins" },
  { id: "context", label: "Context" },
  { id: "voice", label: "Voice" },
  { id: "activity", label: "Activity" },
  { id: "appearance", label: "Appearance" },
  { id: "general", label: "General" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

export function SettingsView() {
  const [params, setParams] = useSearchParams();
  const requested = params.get("section") as SectionId | null;
  const section = SECTIONS.some((item) => item.id === requested) ? requested! : "providers";
  const engineOpen = useEngineStore((state) => state.connection === "open");

  const [collapsed, setCollapsed] = usePreference("intelizen:settings-nav-collapsed", "false");
  const container = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuTrigger = useRef<HTMLButtonElement | null>(null);
  function closeMenu() {
    setMenuOpen(false);
    requestAnimationFrame(() => menuTrigger.current?.focus());
  }
  useEffect(() => {
    const node = container.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        const narrow = entry.contentRect.width < 600;
        setCompact(narrow);
        if (!narrow) setMenuOpen(false);
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const railHidden = compact || collapsed === "true";
  const navigation = (
    <nav className="flex min-h-0 flex-col gap-0.5 overflow-y-auto p-3" aria-label="Settings sections" role="tablist" aria-orientation="vertical">
      {SECTIONS.map((item) => (
        <button key={item.id} type="button" id={`settings-tab-${item.id}`} role="tab" aria-controls="settings-panel"
          onClick={() => { setParams({ section: item.id }, { replace: true }); setMenuOpen(false); }}
          aria-selected={section === item.id} className="nav-node px-[11px] py-[9px] text-left">
          {item.label}
        </button>
      ))}
    </nav>
  );

  return (
    <div ref={container} className="subshell relative h-full bg-[var(--base)]">
      <CollapsibleRail title="Settings" width={180} collapsed={railHidden} onCollapse={() => setCollapsed("true")} collapseLabel="Collapse settings menu">
        {navigation}
      </CollapsibleRail>
      <Drawer open={compact && menuOpen} onClose={closeMenu} label="Settings navigation" className="left-2 right-auto flex w-[180px] max-w-[calc(100%-16px)] flex-col">
        <CollapsibleRail title="Settings" width="100%" collapsed={false} onCollapse={closeMenu} collapseLabel="Collapse settings menu" className="h-full">
          {navigation}
        </CollapsibleRail>
      </Drawer>

      <main className="subpane relative flex min-w-0 flex-1 flex-col overflow-hidden bg-[var(--base)]">
        <CollapsedRailTrigger visible={railHidden} onExpand={(event) => { menuTrigger.current = event.currentTarget; if (compact) setMenuOpen(true); else setCollapsed("false"); }} label="Expand settings menu" />
        <div className={cn("min-h-0 flex-1 overflow-y-auto px-6 pb-1 pt-5", railHidden && "pl-14")}>
          <div id="settings-panel" role="tabpanel" aria-label={`${SECTIONS.find((item) => item.id === section)?.label} settings`} className={`flex flex-col gap-2 ${section === "activity" ? "" : "max-w-[880px]"}`}>
          {section === "providers" ? <ProvidersSettings /> : null}
          {section === "capabilities" ? <CapabilitiesSettings engineOpen={engineOpen} /> : null}
          {section === "plugins" ? <PluginsSettings /> : null}
          {section === "context" ? <ContextSettings /> : null}
          {section === "voice" ? <VoiceSettings /> : null}
          {section === "activity" ? <ActivityDashboard /> : null}
          {section === "appearance" ? <AppearanceSection /> : null}
          {section === "general" ? <GeneralSettings /> : null}
          </div>
        </div>
      </main>
    </div>
  );
}
