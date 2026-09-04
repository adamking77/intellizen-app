// A plugin that throws while rendering fails alone, in place, with its error.
import { Component, type ReactNode } from "react";

export function PluginErrorBox({ name, error }: { name: string; error: string }) {
  return (
    <div
      role="alert"
      className="rounded-[var(--r-ctl)] border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--danger)_11%,transparent)] px-[11px] py-2"
    >
      <p className="font-ui text-[var(--t-ui)] leading-normal text-[var(--danger)]">Plugin “{name}” failed.</p>
      <p className="mt-0.5 break-words font-mono text-[var(--t-section)] leading-normal text-[var(--text-muted)]">{error}</p>
    </div>
  );
}

interface BoundaryProps {
  name: string;
  children: ReactNode;
}

/** Calls `render` inside a child so a throw lands in the boundary above. */
export function PluginSlot({ name, render, resetKey }: { name: string; render: () => ReactNode; resetKey?: unknown }) {
  return (
    <PluginBoundary key={String(resetKey)} name={name}>
      <Rendered render={render} />
    </PluginBoundary>
  );
}

function Rendered({ render }: { render: () => ReactNode }) {
  return <>{render()}</>;
}

export class PluginBoundary extends Component<BoundaryProps, { error: string | null }> {
  state = { error: null as string | null };

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) };
  }

  componentDidCatch(error: unknown) {
    console.error(`[plugins] ${this.props.name} threw while rendering`, error);
  }

  render() {
    if (this.state.error !== null) return <PluginErrorBox name={this.props.name} error={this.state.error} />;
    return this.props.children;
  }
}
