import {
  PanelRightClose,
  PictureInPicture2,
  RefreshCw,
} from "lucide-react";

import { AgentPanelState, type AgentPanelAvailability } from "@/components/agent/agent-panel-state";
import type { AgentPanelRoleTarget } from "@/lib/agent-panel-roles";
import { cn } from "@/lib/utils";

export function AgentPanelHeader({
  mode,
  roleTargets,
  selectedRole,
  selectedRoleKey,
  unreadCount,
  isFetching,
  availability,
  onSelectRole,
  onRefresh,
  onEject,
  onCollapse,
}: {
  mode: "docked" | "standalone";
  roleTargets: AgentPanelRoleTarget[];
  selectedRole: AgentPanelRoleTarget | null;
  selectedRoleKey: string | null;
  unreadCount: number;
  isFetching: boolean;
  availability: AgentPanelAvailability;
  onSelectRole: (roleKey: string | null) => void;
  onRefresh: () => void;
  onEject?: (() => void) | null;
  onCollapse?: (() => void) | null;
}) {
  const detail = selectedRole
    ? selectedRole.state === "ready"
      ? `${selectedRole.agentName ?? selectedRole.agentKey} · ${selectedRole.adapterId}${selectedRole.model ? ` · ${selectedRole.model}` : ""} · ${selectedRole.execution}`
      : "No eligible occupant and runtime binding"
    : "Select a role to begin";
  return (
    <div className="flex min-h-14 shrink-0 items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-2">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <label className="sr-only" htmlFor={`agent-panel-role-${mode}`}>
            Conversation role
          </label>
          <select
            id={`agent-panel-role-${mode}`}
            value={selectedRoleKey ?? ""}
            onChange={(event) => onSelectRole(event.target.value || null)}
            className="min-w-0 max-w-[210px] truncate bg-transparent font-ui text-[13px] font-semibold text-[var(--text)] outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]"
          >
            <option value="">Choose role…</option>
            {roleTargets.map((role) => (
              <option key={role.roleKey} value={role.roleKey}>
                {role.roleName}
                {role.state === "unavailable" ? " · unavailable" : ""}
              </option>
            ))}
          </select>
          {unreadCount > 0 ? (
            <span className="rounded-full bg-[var(--accent)] px-1.5 font-mono text-[10px] leading-4 text-[var(--crust)]">
              {Math.min(unreadCount, 99)} new
            </span>
          ) : null}
        </div>
        <div className="mt-0.5">
          <AgentPanelState mode={mode} state={availability} detail={detail} />
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button type="button" onClick={onRefresh} aria-label="Refresh agent panel" title="Refresh" className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]">
          <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
        </button>
        {onEject ? (
          <button type="button" onClick={onEject} aria-label="Eject agent panel" title="Eject agent panel" className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]">
            <PictureInPicture2 className="h-4 w-4" />
          </button>
        ) : null}
        {onCollapse ? (
          <button type="button" onClick={onCollapse} aria-label="Collapse agent panel" title="Collapse agent panel" className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]">
            <PanelRightClose className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
