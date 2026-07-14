import { useState } from "react";
import { Link } from "react-router-dom";

import { AgentChartAdapter } from "@/components/agent/agent-chart-adapter";
import { SandboxedGenui } from "@/components/agent/sandboxed-genui";
import { MetricCell } from "@/components/ui/metric-cell";
import { Badge } from "@/components/ui/badge";

import type { AgentChatWidget as AgentChatWidgetModel } from "@/lib/agent-widgets";
import { pinGenuiWidget } from "@/lib/genui-pins";
import { cn } from "@/lib/utils";

/**
 * Native renderer for in-chat GenUI widgets (agent-native data-widget
 * contract). Same tokens and density as every other surface per DESIGN.md —
 * agent output is not visually special.
 *
 * `pinnable` (chat surfaces) adds a Pin-to-Home action so any agent-built
 * view can become a persistent dashboard widget.
 */
export function AgentChatWidget({ widget, pinnable = false }: { widget: AgentChatWidgetModel; pinnable?: boolean }) {
  const body =
    widget.kind === "html" ? <SandboxedGenui html={widget.html} title={widget.title} /> : <WidgetCard widget={widget} />;
  if (!pinnable) return body;
  return (
    <div>
      {body}
      <div className="mt-1 flex justify-end">
        <PinAction widget={widget} />
      </div>
    </div>
  );
}

function PinAction({ widget }: { widget: AgentChatWidgetModel }) {
  const [pinned, setPinned] = useState(false);
  return (
    <button
      type="button"
      disabled={pinned}
      onClick={() => {
        pinGenuiWidget(widget);
        setPinned(true);
      }}
      className={cn(
        "font-ui text-[9.5px] font-semibold uppercase tracking-[0.14em] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]",
        pinned ? "text-[var(--success)]" : "text-[var(--overlay-1)] hover:text-[var(--accent)]",
      )}
    >
      {pinned ? "Pinned to Home" : "Pin to Home"}
    </button>
  );
}

function WidgetCard({ widget }: { widget: Exclude<AgentChatWidgetModel, { kind: "html" }> }) {
  return (
    <div className="mt-1.5 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--mantle)]">
      {widget.title ? (
        <div className="border-b border-[var(--border-subtle)] px-2 py-1 font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
          {widget.title}
        </div>
      ) : null}
      {widget.kind === "data-table" ? <WidgetTable widget={widget} /> : null}
      {widget.kind === "data-chart" ? <AgentChartAdapter chart={widget.chart} /> : null}
      {widget.kind === "data-insights" ? (
        <ul className="space-y-1 px-2 py-1.5">
          {widget.insights.slice(0, 6).map((insight, index) => (
            <li key={index} className="flex gap-1.5 font-ui text-[11px] leading-snug text-[var(--subtext-0)]">
              <span className="mt-[5px] h-1 w-1 shrink-0 rounded-full bg-[var(--accent)]" />
              <span>{insight}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {widget.kind === "data-metrics" ? (
        <div className="grid grid-cols-2 gap-3 px-2.5 py-2">
          {widget.metrics.slice(0, 6).map((metric, index) => (
            <MetricCell
              key={index}
              label={metric.label}
              value={metric.value}
              delta={metric.delta}
              className="[&_.text-metric]:text-[20px]"
            />
          ))}
        </div>
      ) : null}
      {widget.kind === "record-links" ? (
        <ul className="py-1">
          {widget.links.slice(0, 8).map((link, index) => (
            <li key={index}>
              <Link
                to={link.to}
                className="flex items-center justify-between gap-2 px-2.5 py-1.5 transition-colors hover:bg-[var(--surface-wash)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]"
              >
                <span className="min-w-0 truncate font-ui text-[11.5px] text-[var(--text)]">{link.label}</span>
                {link.status ? <Badge variant="outline">{link.status}</Badge> : null}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function WidgetTable({ widget }: { widget: Extract<AgentChatWidgetModel, { kind: "data-table" }> }) {
  const columns = widget.table.columns.slice(0, 4);
  const rows = widget.table.rows.slice(0, 6);
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-[var(--border-subtle)]">
            {columns.map((column) => (
              <th
                key={column.key}
                className={cn(
                  "px-2 py-1 font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]",
                  column.align === "right" ? "text-right" : "text-left",
                )}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-b border-[var(--border-subtle)] last:border-b-0">
              {columns.map((column) => {
                const value = row[column.key];
                const display = value === null || value === undefined ? "—" : String(value);
                const numeric = typeof value === "number";
                return (
                  <td
                    key={column.key}
                    className={cn(
                      "max-w-[140px] truncate px-2 py-1 text-[11px] leading-snug",
                      numeric || column.align === "right"
                        ? "text-right font-mono text-[var(--text)]"
                        : "text-left font-ui text-[var(--subtext-0)]",
                    )}
                    title={display}
                  >
                    {display}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {widget.table.truncated || (widget.table.totalRows ?? rows.length) > rows.length ? (
        <div className="border-t border-[var(--border-subtle)] px-2 py-1 font-mono text-[9.5px] text-[var(--overlay-1)]">
          {widget.table.totalRows ?? "more"} total rows
        </div>
      ) : null}
    </div>
  );
}
