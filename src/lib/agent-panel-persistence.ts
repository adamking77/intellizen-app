export const AGENT_PANEL_COLLAPSED_KEY = "intelizen:agent-panel-collapsed";
export const AGENT_PANEL_WIDTH_KEY = "intelizen:agent-panel-width";
export const AGENT_PANEL_OPEN_EVENT = "intelizen:agent-panel:open";

/** Ask the shell to reveal the real panel. The caller selects the target
 *  first, so an ejected panel receives the same exact conversation frame. */
export function requestAgentPanelOpen() {
  window.dispatchEvent(new Event(AGENT_PANEL_OPEN_EVENT));
}

export function readAgentPanelCollapsed(
  storage: Pick<Storage, "getItem"> | null,
): boolean | null {
  const raw = storage?.getItem(AGENT_PANEL_COLLAPSED_KEY);
  if (raw === "1") return true;
  if (raw === "0") return false;
  return null;
}

export function appendToAgentPanelDraft(current: string, addition: string) {
  const trimmed = addition.trim();
  if (!trimmed) return current;
  return `${current.trim()}${current.trim() ? "\n\n" : ""}${trimmed}`;
}
