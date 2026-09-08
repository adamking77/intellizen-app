import { request, type GatewayClientLike } from "./contract";

export type ApprovalMode = "manual" | "smart" | "off";

function approvalMode(value: unknown): ApprovalMode {
  if (value === "manual" || value === "smart" || value === "off") return value;
  throw new Error("Hermes returned an unknown approval mode.");
}

function scope(profile: string, sessionId: string | null) {
  return { key: "approvals.mode", profile, session_id: sessionId ?? "" };
}

export async function readApprovalMode(client: GatewayClientLike, profile: string, sessionId: string | null) {
  const result = await request<{ value?: unknown }>(client, "config.get", scope(profile, sessionId));
  return approvalMode(result.value);
}

export async function saveApprovalMode(client: GatewayClientLike, profile: string, sessionId: string | null, mode: ApprovalMode) {
  await request(client, "config.set", { ...scope(profile, sessionId), value: mode });
  return readApprovalMode(client, profile, sessionId);
}
