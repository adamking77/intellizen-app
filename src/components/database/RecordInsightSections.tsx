import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { History, Link2, ListTree, RotateCcw } from "lucide-react";

import {
  listDeletedRecords,
  listRecordRevisions,
  listWorkEvents,
  restoreDeletedRecord,
  restoreRecordRevision,
  type RecordRevisionItem,
} from "@/lib/data";
import { getRecordTitle } from "@/lib/database-core";
import type {
  WorkspaceDatabaseCatalogEntry,
  WorkspaceDatabaseField,
  WorkspaceDatabaseRecordModel,
} from "@/lib/types";
import { toast, toastError } from "@/lib/toast";
import { formatDateTime } from "@/lib/utils";

/** Structured activity feed from the append-only work_events audit log. */
export function RecordActivitySection({ recordId, isWorkflowRun }: { recordId: string; isWorkflowRun: boolean }) {
  const eventsQuery = useQuery({
    queryKey: ["work-events", recordId],
    queryFn: () =>
      listWorkEvents(isWorkflowRun ? { recordId, workflowRunId: recordId, limit: 20 } : { recordId, limit: 20 }),
    staleTime: 30_000,
  });
  const events = eventsQuery.data ?? [];

  return (
    <section className="db-record-section px-6 py-3">
      <div className="db-record-section-head">
        <div className="db-record-section-title mb-0 flex items-center gap-1.5">
          <ListTree className="h-3.5 w-3.5" />
          Activity
        </div>
        <span className="db-record-section-count">{events.length}</span>
      </div>
      {eventsQuery.isLoading ? (
        <p className="font-ui text-[12px] text-[var(--overlay-1)]">Loading activity…</p>
      ) : eventsQuery.error ? (
        <p className="rounded-md border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] px-3 py-2 font-ui text-[12px] text-[var(--danger)]">
          Activity could not be loaded.
        </p>
      ) : events.length === 0 ? (
        <p className="rounded-md border border-dashed border-[var(--border)] px-3 py-2 font-ui text-[12px] text-[var(--overlay-1)]">
          No structured activity recorded yet.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {events.map((event) => (
            <li key={event.id} className="rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] uppercase text-[var(--accent)]">{event.event_kind.replace(/_/g, " ")}</span>
                <span className="shrink-0 font-mono text-[10px] text-[var(--overlay-1)]">{formatDateTime(event.created_at)}</span>
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 font-ui text-[11px] text-[var(--subtext-0)]">
                <span className="font-medium text-[var(--text)]">{event.actor}</span>
                {event.durable_role ? <span className="text-[var(--overlay-1)]">· {event.durable_role}</span> : null}
                {event.decision_role ? <span className="text-[var(--caution)]">· {event.decision_role}</span> : null}
              </div>
              {event.summary ? (
                <p className="mt-0.5 line-clamp-2 font-ui text-[11px] leading-snug text-[var(--subtext-0)]">{event.summary}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Version history with restore, backed by the record_revisions trigger. */
export function RecordHistorySection({ recordId }: { recordId: string }) {
  const queryClient = useQueryClient();
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const revisionsQuery = useQuery({
    queryKey: ["record-revisions", recordId],
    queryFn: () => listRecordRevisions(recordId, 15),
    staleTime: 30_000,
  });
  const revisions = (revisionsQuery.data ?? []).filter((revision) => revision.op === "update");

  async function handleRestore(revision: RecordRevisionItem) {
    try {
      setRestoringId(revision.id);
      await restoreRecordRevision(revision);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["workspace-database"] }),
        queryClient.invalidateQueries({ queryKey: ["record-revisions", recordId] }),
      ]);
      toast.success("Record restored", { description: `Reverted to ${formatDateTime(revision.revised_at)}` });
    } catch (restoreError) {
      toastError("Restore failed", restoreError);
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <section className="db-record-section px-6 py-3">
      <div className="db-record-section-head">
        <div className="db-record-section-title mb-0 flex items-center gap-1.5">
          <History className="h-3.5 w-3.5" />
          History
        </div>
        <span className="db-record-section-count">{revisions.length}</span>
      </div>
      {revisionsQuery.isLoading ? (
        <p className="font-ui text-[12px] text-[var(--overlay-1)]">Loading history…</p>
      ) : revisionsQuery.error ? (
        <p className="rounded-md border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] px-3 py-2 font-ui text-[12px] text-[var(--danger)]">
          History could not be loaded.
        </p>
      ) : revisions.length === 0 ? (
        <p className="rounded-md border border-dashed border-[var(--border)] px-3 py-2 font-ui text-[12px] text-[var(--overlay-1)]">
          No prior versions captured yet. Edits from here on are versioned automatically.
        </p>
      ) : (
        <ul className="space-y-1">
          {revisions.map((revision) => (
            <li key={revision.id} className="flex items-center justify-between gap-2 rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5">
              <div className="min-w-0">
                <span className="font-mono text-[10.5px] text-[var(--text)]">{formatDateTime(revision.revised_at)}</span>
                <span className="ml-2 font-ui text-[10.5px] text-[var(--overlay-1)]">
                  {(revision.body ?? "").length > 0 ? `${(revision.body ?? "").length} chars` : "fields only"}
                </span>
              </div>
              <button
                type="button"
                className="db-btn shrink-0"
                disabled={restoringId !== null}
                onClick={() => void handleRestore(revision)}
                title="Restore this version"
              >
                <RotateCcw className="h-3 w-3" />
                {restoringId === revision.id ? "Restoring…" : "Restore"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Recently deleted records for a database, restorable from their trash revision. */
export function DatabaseTrashPanel({
  databaseId,
  schema,
  onClose,
}: {
  databaseId: string;
  schema: WorkspaceDatabaseField[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const trashQuery = useQuery({
    queryKey: ["record-trash", databaseId],
    queryFn: () => listDeletedRecords(databaseId, 25),
    staleTime: 15_000,
  });
  const deleted = trashQuery.data ?? [];

  function titleFor(revision: RecordRevisionItem) {
    const model: WorkspaceDatabaseRecordModel = { id: revision.record_id, ...revision.fields };
    return getRecordTitle(model, { schema, headerFieldIds: [], records: [] });
  }

  async function handleRestore(revision: RecordRevisionItem) {
    try {
      setRestoringId(revision.id);
      await restoreDeletedRecord(revision);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["workspace-database"] }),
        queryClient.invalidateQueries({ queryKey: ["workspace-database-catalog"] }),
        queryClient.invalidateQueries({ queryKey: ["record-trash", databaseId] }),
      ]);
      toast.success("Record restored from trash");
    } catch (restoreError) {
      toastError("Restore failed", restoreError);
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <div className="mb-4 max-w-2xl rounded-md border border-[var(--border)] bg-[var(--mantle)] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-ui text-[11px] font-semibold uppercase text-[var(--overlay-1)]">Trash</span>
        <button type="button" className="db-btn" onClick={onClose}>
          Close
        </button>
      </div>
      {trashQuery.isLoading ? (
        <p className="font-ui text-[12px] text-[var(--overlay-1)]">Loading trash…</p>
      ) : trashQuery.error ? (
        <p className="rounded-md border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] px-3 py-2 font-ui text-[12px] text-[var(--danger)]">
          Trash could not be loaded.
        </p>
      ) : deleted.length === 0 ? (
        <p className="rounded-md border border-dashed border-[var(--border)] px-3 py-2 font-ui text-[12px] text-[var(--overlay-1)]">
          No deleted records. Deletions from here on land in the trash automatically.
        </p>
      ) : (
        <ul className="space-y-1">
          {deleted.map((revision) => (
            <li key={revision.id} className="flex items-center justify-between gap-2 rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5">
              <div className="min-w-0">
                <p className="truncate font-ui text-[12px] text-[var(--text)]">{titleFor(revision)}</p>
                <p className="font-mono text-[10px] text-[var(--overlay-1)]">deleted {formatDateTime(revision.revised_at)}</p>
              </div>
              <button
                type="button"
                className="db-btn shrink-0"
                disabled={restoringId !== null}
                onClick={() => void handleRestore(revision)}
              >
                <RotateCcw className="h-3 w-3" />
                {restoringId === revision.id ? "Restoring…" : "Restore"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface Backlink {
  databaseId: string;
  databaseName: string;
  fieldName: string;
  record: WorkspaceDatabaseRecordModel;
  recordTitle: string;
}

/** Records elsewhere in the workspace whose relation fields point at this record. */
export function RecordBacklinksSection({
  recordId,
  databaseId,
  catalog,
  onOpenRecord,
}: {
  recordId: string;
  databaseId: string;
  catalog: WorkspaceDatabaseCatalogEntry[];
  onOpenRecord?: (databaseId: string, recordId: string) => void;
}) {
  const backlinks: Backlink[] = [];
  for (const entry of catalog) {
    const inboundFields = entry.schema.filter(
      (field) => field.type === "relation" && field.relation?.targetDatabaseId === databaseId,
    );
    if (inboundFields.length === 0) continue;
    for (const record of entry.records) {
      if (record.id === recordId) continue;
      for (const field of inboundFields) {
        const value = record[field.id];
        const ids = Array.isArray(value) ? value : typeof value === "string" && value ? [value] : [];
        if (ids.includes(recordId)) {
          backlinks.push({
            databaseId: entry.id,
            databaseName: entry.name,
            fieldName: field.name,
            record,
            recordTitle: getRecordTitle(record, {
              schema: entry.schema,
              headerFieldIds: entry.headerFieldIds,
              records: entry.records,
            }),
          });
          break;
        }
      }
    }
  }

  if (backlinks.length === 0) return null;

  return (
    <section className="db-record-section px-6 py-3">
      <div className="db-record-section-head">
        <div className="db-record-section-title mb-0 flex items-center gap-1.5">
          <Link2 className="h-3.5 w-3.5" />
          Linked from
        </div>
        <span className="db-record-section-count">{backlinks.length}</span>
      </div>
      <ul className="space-y-1">
        {backlinks.slice(0, 12).map((backlink) => (
          <li key={`${backlink.databaseId}-${backlink.record.id}`}>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5 text-left transition-colors hover:bg-[var(--surface-wash)]"
              onClick={() => onOpenRecord?.(backlink.databaseId, backlink.record.id)}
            >
              <span className="min-w-0 truncate font-ui text-[11.5px] text-[var(--text)]">{backlink.recordTitle}</span>
              <span className="shrink-0 font-ui text-[10px] text-[var(--overlay-1)]">
                {backlink.databaseName} · {backlink.fieldName}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
