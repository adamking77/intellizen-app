/**
 * Watch-domain → entity palette mapping (Catppuccin Mocha).
 * Used for left accent strips, chips, and signal-detail badges.
 */
export const DOMAIN_COLOR: Record<string, string> = {
  "Family Offices": "var(--entity-org)",          // Sapphire
  "SE Asia": "var(--entity-location)",             // Peach
  "Spiritual Exploitation": "var(--entity-topic)", // Mauve
  "Crypto Fraud": "var(--entity-event)",           // Red
  "Macro Political": "var(--entity-investigation)",// Blue
  "Development Projects": "var(--entity-report)",  // Green
  "Social & Cultural": "var(--entity-signal)",     // Yellow
  "Social / Cultural": "var(--entity-signal)",
};

export const DEFAULT_DOMAIN_COLOR = "var(--overlay-1)";

export function domainColor(domain?: string | null): string {
  if (!domain) return DEFAULT_DOMAIN_COLOR;
  return DOMAIN_COLOR[domain] ?? DEFAULT_DOMAIN_COLOR;
}
