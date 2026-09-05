import {
  activityFilter,
  type ActivityCardId,
  type ActivityFilter,
} from "./activity-dashboard";
import {
  configForDashboard,
  createInstrumentHomePin,
  dashboardScope,
  isInstrumentHomePin,
  type DashboardScope,
  type HomeInstrumentPin,
  type HomePin,
} from "./home-pins";

export function activityPinFilter(pin: HomeInstrumentPin): ActivityFilter {
  const filter = activityFilter(pin.config?.activity);
  const scope = dashboardScope(pin);
  return scope === "home" ? filter : { ...filter, workspace: scope.slice(10) };
}
export function pinActivityCard(
  pins: HomePin[],
  card: ActivityCardId,
  title: string,
  filter: ActivityFilter,
  scope: DashboardScope,
): HomePin[] {
  const scopedFilter =
    scope === "home" ? filter : { ...filter, workspace: scope.slice(10) };
  const instrumentId = `activity.${card}`;
  if (
    pins.some(
      (pin) =>
        isInstrumentHomePin(pin) &&
        pin.instrumentId === instrumentId &&
        dashboardScope(pin) === scope &&
        JSON.stringify(activityPinFilter(pin)) === JSON.stringify(scopedFilter),
    )
  )
    return pins;
  const siblings = pins.filter((pin) => dashboardScope(pin) === scope);
  const pin = createInstrumentHomePin([], { instrumentId, title });
  return [
    ...pins,
    {
      ...pin,
      x: 0,
      y: Math.max(0, ...siblings.map((p) => p.y + p.h)),
      w: 6,
      h: 14,
      config: configForDashboard({ activity: scopedFilter }, scope),
    },
  ];
}
