import { useEffect, useState } from "react";

import { currentRotation } from "@/lib/rotation";

export function WeekTheme({ now }: { now?: Date }) {
  const [currentTime, setCurrentTime] = useState(() => now ?? new Date());

  useEffect(() => {
    if (now) {
      setCurrentTime(now);
      return;
    }

    const refresh = () => setCurrentTime(new Date());
    const nextDay = new Date();
    nextDay.setHours(24, 0, 0, 0);
    const timer = window.setTimeout(refresh, Math.max(1, nextDay.getTime() - Date.now()));
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [currentTime, now]);

  const rotation = currentRotation(currentTime);
  const label = `${rotation.week} week · ${rotation.daysRemaining} ${rotation.daysRemaining === 1 ? "day" : "days"} remaining`;

  return (
    <span
      className="block truncate font-ui text-[length:var(--t-count)] text-[var(--foreground-muted)]"
      title={label}
    >
      {label}
    </span>
  );
}
