export type PersistenceSafetyFinding = {
  path: string;
  rule:
    | "authorization-header"
    | "provider-key"
    | "jwt"
    | "named-secret"
    | "high-entropy-token";
};

export function assessPersistenceSafety(value: unknown): {
  safe: boolean;
  findings: PersistenceSafetyFinding[];
};

export function assertPersistenceSafe<T>(value: T): T;

