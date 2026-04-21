/**
 * Sogo → InteliZen Design Token Adapter
 *
 * Reference mapping for translating Sogo's VS Code CSS variables
 * to InteliZen's Catppuccin tokens during component porting.
 */

export const TOKEN_MAP: Record<string, string> = {
  "var(--vscode-editor-background)": "var(--mantle)",
  "var(--vscode-sideBar-background)": "var(--base)",
  "var(--vscode-panel-border)": "var(--border)",
  "var(--vscode-widget-border)": "var(--border-subtle)",
  "var(--vscode-list-hoverBackground)": "var(--surface-wash)",
  "var(--vscode-focusBorder)": "var(--accent)",
  "var(--vscode-button-background)": "var(--accent)",
  "var(--vscode-button-foreground)": "var(--crust)",
  "var(--vscode-button-secondaryBackground)": "var(--surface-1)",
  "var(--vscode-button-secondaryForeground)": "var(--text)",
  "var(--vscode-input-background)": "var(--base)",
  "var(--vscode-input-foreground)": "var(--text)",
  "var(--vscode-input-border)": "var(--border)",
  "var(--vscode-descriptionForeground)": "var(--overlay-1)",
  "var(--vscode-errorForeground)": "var(--danger)",
  "var(--vscode-badge-background)": "var(--surface-1)",
  "var(--vscode-badge-foreground)": "var(--text)",
  "var(--vscode-editorWidget-background)": "var(--base)",
  "var(--vscode-textCodeBlock-background)": "rgba(255,255,255,0.06)",
  "var(--vscode-textBlockQuote-border)": "rgba(255,255,255,0.15)",
  "var(--vscode-textLink-foreground)": "var(--accent)",
  "var(--vscode-textLink-activeForeground)": "var(--accent)",
  "var(--vscode-menu-background)": "var(--mantle)",
  "var(--vscode-menu-foreground)": "var(--text)",
  "var(--vscode-menu-border)": "var(--border)",
  "var(--vscode-editor-font-family)": "var(--font-mono)",
  "var(--vscode-font-family)": "var(--font-sans)",
  "var(--vscode-color-scheme)": "dark",
  "var(--vscode-progressBar-background)": "var(--accent)",
  "var(--vscode-scrollbarSlider-background)": "var(--surface-1)",
  "var(--vscode-scrollbarSlider-hoverBackground)": "var(--surface-2)",
};

/** Convert a Sogo style object using vscode vars to InteliZen tokens */
export function adaptSogoStyle(style: React.CSSProperties): React.CSSProperties {
  const next: React.CSSProperties = {};
  for (const [key, value] of Object.entries(style)) {
    if (typeof value === "string" && value.startsWith("var(--vscode-")) {
      (next as Record<string, string>)[key] = TOKEN_MAP[value] ?? value;
    } else {
      (next as Record<string, unknown>)[key] = value;
    }
  }
  return next;
}
