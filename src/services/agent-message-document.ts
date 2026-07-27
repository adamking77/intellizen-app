import { createVaultDocument } from "@/lib/data";
import { assertPersistenceSafe } from "../../shared/persistence-redaction.mjs";

export interface AgentMessageDocumentPreview {
  dryRun: true;
  writePerformed: false;
  title: string;
  sourcePath: string;
  content: string;
  roleKey: string;
  agentKey: string;
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

export function previewAgentMessageDocument(input: {
  text: string;
  roleKey: string;
  agentKey: string;
  createdAt: string;
}): AgentMessageDocumentPreview {
  assertPersistenceSafe(input);
  const firstLine = input.text
    .split("\n")
    .map((line) => line.replace(/^#+\s*/, "").trim())
    .find(Boolean);
  const title = (firstLine || `${input.agentKey} response`).slice(0, 120);
  const date = input.createdAt.slice(0, 10);
  return {
    dryRun: true,
    writePerformed: false,
    title,
    sourcePath: `agent-panel/${input.roleKey}/${date}-${slug(title) || "response"}.md`,
    content: input.text,
    roleKey: input.roleKey,
    agentKey: input.agentKey,
  };
}

export async function saveAgentMessageDocument(
  preview: AgentMessageDocumentPreview,
  confirmWrite: boolean,
) {
  if (!confirmWrite) return preview;
  assertPersistenceSafe(preview);
  const document = await createVaultDocument({
    title: preview.title,
    sourcePath: preview.sourcePath,
    content: preview.content,
    documentType: "note",
    domain: "internal",
    metadata: {
      source: "intellizen-agent-panel",
      actor_role_key: preview.roleKey,
      actor_agent_key: preview.agentKey,
    },
  });
  return {
    dryRun: false as const,
    writePerformed: true as const,
    document,
  };
}
