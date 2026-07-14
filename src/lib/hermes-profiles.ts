export interface HermesProfileStatus {
  isDefault: boolean;
  gatewayRunning: boolean;
}

/**
 * The active gateway describes the model answering requests right now. The
 * dashboard's default profile is only a configuration fallback and may be
 * stopped while another named profile is running.
 */
export function selectActiveHermesProfile<T extends HermesProfileStatus>(profiles: T[]) {
  return (
    profiles.find((profile) => profile.gatewayRunning && profile.isDefault) ??
    profiles.find((profile) => profile.gatewayRunning) ??
    profiles.find((profile) => profile.isDefault) ??
    profiles[0] ??
    null
  );
}
