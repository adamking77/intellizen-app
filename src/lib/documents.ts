import type { WorkspaceDatabaseRecordModel } from "@/lib/types";

export const DOCUMENTS_DB_FIELDS = {
  title: "doc_title",
  docType: "doc_type",
  stage: "doc_stage",
  entity: "doc_entity",
  author: "doc_author",
  vaultPath: "doc_vault_path",
  folder: "doc_folder",
  attachmentType: "doc_attachment_type",
  attachedTo: "doc_attached_to",
  linkedCase: "doc_linked_case",
  linkedEngagement: "doc_linked_engagement",
  linkedClient: "doc_linked_client",
  linkedCompany: "doc_linked_company",
  templateSource: "doc_template_source",
  createdAt: "doc_created_at",
  updatedAt: "doc_updated_at",
} as const;

export function documentFieldString(
  record: WorkspaceDatabaseRecordModel | null | undefined,
  fieldId: string,
) {
  const value = record?.[fieldId];
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

export function humanizeDocumentFilename(raw: string) {
  const pathSegments = raw.split(/[\\/]/);
  const base = (pathSegments[pathSegments.length - 1] ?? raw).replace(/\.[^.]+$/, "");
  const words = base.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  if (!words) return "Untitled document";
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function documentDisplayTitle(record: WorkspaceDatabaseRecordModel) {
  const recordTitle = documentFieldString(record, DOCUMENTS_DB_FIELDS.title).trim();
  if (recordTitle) return recordTitle;
  const vaultPath = documentFieldString(record, DOCUMENTS_DB_FIELDS.vaultPath);
  return vaultPath ? humanizeDocumentFilename(vaultPath) : "Untitled document";
}

export function documentMatchesSearch(record: WorkspaceDatabaseRecordModel, query: string) {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return true;
  const searchable = [
    documentDisplayTitle(record),
    documentFieldString(record, DOCUMENTS_DB_FIELDS.docType),
    documentFieldString(record, DOCUMENTS_DB_FIELDS.entity),
    documentFieldString(record, DOCUMENTS_DB_FIELDS.author),
    documentFieldString(record, DOCUMENTS_DB_FIELDS.folder),
    documentFieldString(record, DOCUMENTS_DB_FIELDS.vaultPath),
    documentFieldString(record, DOCUMENTS_DB_FIELDS.attachedTo),
    documentFieldString(record, DOCUMENTS_DB_FIELDS.linkedCase),
    documentFieldString(record, DOCUMENTS_DB_FIELDS.linkedEngagement),
    documentFieldString(record, DOCUMENTS_DB_FIELDS.linkedClient),
    documentFieldString(record, DOCUMENTS_DB_FIELDS.linkedCompany),
  ].join("\n").toLocaleLowerCase();
  return searchable.includes(normalized);
}

function timestamp(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export type DocumentFreshness = "new" | "changed" | null;

export function documentFreshness(
  record: WorkspaceDatabaseRecordModel,
  now = Date.now(),
  windowMs = 36 * 60 * 60 * 1000,
): DocumentFreshness {
  const created = timestamp(
    documentFieldString(record, DOCUMENTS_DB_FIELDS.createdAt) || String(record._createdAt ?? ""),
  );
  const updated = timestamp(
    documentFieldString(record, DOCUMENTS_DB_FIELDS.updatedAt) || String(record._updatedAt ?? ""),
  );
  if (created > 0 && now - created <= windowMs) return "new";
  if (updated > 0 && now - updated <= windowMs && updated - created > 60_000) return "changed";
  return null;
}

export function documentAttachmentLabel(record: WorkspaceDatabaseRecordModel) {
  const pointers = [
    ["Case", documentFieldString(record, DOCUMENTS_DB_FIELDS.linkedCase)],
    ["Engagement", documentFieldString(record, DOCUMENTS_DB_FIELDS.linkedEngagement)],
    ["Client", documentFieldString(record, DOCUMENTS_DB_FIELDS.linkedClient)],
    ["Company", documentFieldString(record, DOCUMENTS_DB_FIELDS.linkedCompany)],
  ] as const;
  const known = pointers.find(([, value]) => value.trim());
  if (known) return `${known[0]} ${known[1]}`;

  const attachedTo = documentFieldString(record, DOCUMENTS_DB_FIELDS.attachedTo).trim();
  if (!attachedTo) return "";
  const type = documentFieldString(record, DOCUMENTS_DB_FIELDS.attachmentType).trim();
  return `${type ? `${type.charAt(0).toUpperCase()}${type.slice(1)} ` : ""}${attachedTo}`;
}

export function isAbsoluteDocumentPath(path: string) {
  return path.startsWith("/") || path.startsWith("\\") || /^[A-Za-z]:[\\/]/.test(path);
}

export function documentSourceLabel(record: WorkspaceDatabaseRecordModel) {
  const path = documentFieldString(record, DOCUMENTS_DB_FIELDS.vaultPath);
  if (!path) return "Supabase Documents row";
  if (isAbsoluteDocumentPath(path)) return "File outside the GenZen OS vault";
  return "Supabase Documents row + GenZen OS vault file";
}

function localDateKey(value: string | number | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()].join("-");
}

export function todaysDailyBriefs(
  records: WorkspaceDatabaseRecordModel[],
  options: { now?: Date; entity?: string | null } = {},
) {
  const today = localDateKey(options.now ?? new Date());
  return records
    .filter((record) => {
      if (documentFieldString(record, DOCUMENTS_DB_FIELDS.docType) !== "daily-brief") return false;
      if (options.entity && documentFieldString(record, DOCUMENTS_DB_FIELDS.entity) !== options.entity) return false;
      const created = documentFieldString(record, DOCUMENTS_DB_FIELDS.createdAt) || String(record._createdAt ?? "");
      return localDateKey(created) === today;
    })
    .sort((left, right) => {
      const leftUpdated = documentFieldString(left, DOCUMENTS_DB_FIELDS.updatedAt) || String(left._updatedAt ?? "");
      const rightUpdated = documentFieldString(right, DOCUMENTS_DB_FIELDS.updatedAt) || String(right._updatedAt ?? "");
      return Date.parse(rightUpdated) - Date.parse(leftUpdated);
    });
}

export function documentBodyPreview(content: string, maxLength = 180) {
  const withoutFrontmatter = content.replace(/^---\n[\s\S]*?\n---\n?/, "");
  const plain = withoutFrontmatter
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[`*_>~-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= maxLength) return plain;
  return `${plain.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function slugForDocumentTitle(title: string) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "document";
}

export function safeDocumentFolder(candidate?: string | null) {
  const value = candidate?.trim() ?? "";
  if (!value || isAbsoluteDocumentPath(value) || value.split(/[\\/]+/).includes("..")) {
    return "documents";
  }
  return value.replace(/^[/\\]+|[/\\]+$/g, "") || "documents";
}

export function quickNoteTitle(date = new Date()) {
  const day = new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
  const time = new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  return `Quick note — ${day}, ${time}`;
}

/** Keep markdown portable while giving file/row sync a stable identity. */
export function upsertDocumentFrontmatterId(content: string, recordId: string) {
  const normalized = content.replace(/\r\n/g, "\n");
  const idLine = `intellizen_id: ${recordId}`;
  if (!normalized.startsWith("---\n")) {
    return `---\n${idLine}\n---\n\n${normalized}`;
  }

  const closingIndex = normalized.indexOf("\n---", 4);
  if (closingIndex < 0) {
    return `---\n${idLine}\n---\n\n${normalized}`;
  }

  const frontmatter = normalized.slice(4, closingIndex);
  const nextFrontmatter = /(^|\n)intellizen_id\s*:/m.test(frontmatter)
    ? frontmatter.replace(/(^|\n)intellizen_id\s*:[^\n]*/m, `$1${idLine}`)
    : `${frontmatter}${frontmatter ? "\n" : ""}${idLine}`;
  return `---\n${nextFrontmatter}${normalized.slice(closingIndex)}`;
}
