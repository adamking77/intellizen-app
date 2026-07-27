import type { WorkEventItem } from "@/lib/data";

export interface RunInspectorNode {
  assignmentId: string;
  role: string;
  agent: string;
  binding: string;
  parentEnvelopeId: string | null;
  status: string;
}

export interface RunInspectorAuthority {
  assignmentId: string;
  mediated: string;
  providerNative: string;
  unmanaged: string;
}

export interface RunInspectorVerification {
  label: "independent agent verification" | "verification claim";
  status: "passed" | "failed" | "inconclusive";
  producingAssignmentId: string | null;
  verifyingAssignmentId: string | null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

export function buildRunInspector(events: WorkEventItem[]) {
  const ordered = [...events].sort(
    (left, right) =>
      new Date(left.created_at).getTime() - new Date(right.created_at).getTime(),
  );
  const nodes = new Map<string, RunInspectorNode>();
  const authorities: RunInspectorAuthority[] = [];
  const verifications: RunInspectorVerification[] = [];

  for (const event of ordered) {
    const payload = record(event.payload);
    const assignmentId = text(payload.assignmentId);
    if (event.event_kind === "assignment_created" && assignmentId) {
      const envelope = record(payload.envelope);
      const parent = record(envelope.parent);
      const resolution = record(payload.resolution);
      const authority = record(payload.authority);
      nodes.set(assignmentId, {
        assignmentId,
        role: text(envelope.role, event.durable_role ?? "unknown role"),
        agent: text(
          resolution.selectedAgent,
          text(envelope.resolvedAgent, event.actor),
        ),
        binding: text(
          resolution.selectedBinding,
          text(envelope.bindingRef, "unknown binding"),
        ),
        parentEnvelopeId: text(parent.envelopeId) || null,
        status: "running",
      });
      authorities.push({
        assignmentId,
        mediated: text(authority.mediated, "not reported"),
        providerNative: text(authority.providerNative, "not reported"),
        unmanaged: text(authority.unmanaged, "not reported"),
      });
    }
    if (assignmentId && nodes.has(assignmentId)) {
      const node = nodes.get(assignmentId) as RunInspectorNode;
      if (
        event.event_kind === "agent_completed" ||
        event.event_kind === "workflow_completed"
      ) node.status = "completed";
      if (event.event_kind.startsWith("runtime_")) {
        node.status =
          event.event_kind === "runtime_cancelled"
            ? "cancelled"
            : event.event_kind === "runtime_abandoned"
              ? "abandoned"
              : "blocked";
      }
    }
    if (event.event_kind === "verification_recorded") {
      const verification = record(payload.verification);
      const label =
        verification.label === "independent agent verification"
          ? "independent agent verification"
          : "verification claim";
      const status = ["passed", "failed", "inconclusive"].includes(
        text(verification.status),
      )
        ? (verification.status as RunInspectorVerification["status"])
        : "inconclusive";
      verifications.push({
        label,
        status,
        producingAssignmentId:
          text(verification.producingAssignmentId) || null,
        verifyingAssignmentId:
          text(verification.verifyingAssignmentId) || null,
      });
    }
  }

  return {
    nodes: Array.from(nodes.values()),
    authorities,
    verifications,
    receipts: [...events].sort(
      (left, right) =>
        new Date(right.created_at).getTime() -
        new Date(left.created_at).getTime(),
    ),
  };
}
