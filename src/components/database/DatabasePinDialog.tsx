import { useState } from "react";

import { DatabaseButton as Button } from "@/components/database/primitives/DatabaseButton";
import { DatabaseDialog as AppDialog } from "@/components/database/primitives/DatabaseDialog";
import type { DashboardScope } from "@/lib/home-pins";

type PinDestination = { scope: DashboardScope; label: string };

export function DatabasePinDialog({
  open,
  destinations,
  pinnedDestinations,
  onOpenChange,
  onPin,
  onOpenDashboard,
}: {
  open: boolean;
  destinations: PinDestination[];
  pinnedDestinations: DashboardScope[];
  onOpenChange: (open: boolean) => void;
  onPin: (scope: DashboardScope) => void;
  onOpenDashboard: (scope: DashboardScope) => void;
}) {
  const [destination, setDestination] = useState<DashboardScope>("home");
  const selected = destinations.find((item) => item.scope === destination) ?? destinations[0];
  const pinned = pinnedDestinations.includes(destination);

  return (
    <AppDialog open={open} title="Pin this view" onOpenChange={onOpenChange}>
      <div className="space-y-4 p-4">
        <label className="flex flex-col gap-2 text-[length:var(--t-meta)] text-[var(--text-mid)]">
          Dashboard
          <select className="db-select" value={destination} onChange={(event) => setDestination(event.target.value as DashboardScope)}>
            {destinations.map((item) => <option key={item.scope} value={item.scope}>{item.label}</option>)}
          </select>
        </label>
        <p className="text-[length:var(--t-meta)] text-[var(--text-muted)]">
          Saves this view’s current filters, sort, display, and grouping settings for {selected?.label ?? "this dashboard"}.
        </p>
        <div className="flex justify-end gap-2">
          {pinned ? <Button type="button" size="sm" variant="ghost" onClick={() => onOpenDashboard(destination)}>Open dashboard</Button> : null}
          <Button type="button" size="sm" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" size="sm" variant={pinned ? "destructive" : "primary"} onClick={() => { onPin(destination); onOpenChange(false); }}>
            {pinned ? "Remove pin" : "Pin view"}
          </Button>
        </div>
      </div>
    </AppDialog>
  );
}
