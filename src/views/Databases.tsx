import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  Loader2,
  MoreHorizontal,
  Plus,
  Trash2,
} from "lucide-react";

import { CollapsedRailTrigger } from "@/components/layout/collapsed-rail-trigger";
import { CollapsibleRail } from "@/components/layout/collapsible-rail";
import { DatabaseConfirmDialog as ConfirmDialog } from "@/components/database/primitives/DatabaseConfirmDialog";
import { ContextMenu, type ContextMenuState } from "@/components/ui/context-menu";
import { DatabaseEditorView } from "@/views/DatabaseEditor";
import { DatabaseButton as Button } from "@/components/database/primitives/DatabaseButton";
import { VentureScope } from "@/components/ui/venture-scope";
import { loadCurrentDatabaseId, saveCurrentDatabaseId } from "@/lib/current-database";
import { loadHomePins, removeHomePinsForDatabase, saveHomePins } from "@/lib/home-pins";
import {
  createWorkspaceDatabase,
  deleteWorkspaceDatabase,
  isOperationalSystemWorkspaceIcon,
  listWorkspaceDatabaseWayIn,
  removeHomePinsForWorkspaceDatabase,
} from "@/lib/data";
import { toast, toastError } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store";

const DATABASE_RAIL_STORAGE_KEY = "intelizen:databases-rail-collapsed";
const DATABASE_RAIL_WIDTH_EXPANDED = 280;
const DATABASES_LAST_VISIT_KEY = "intelizen:databases-last-visit";

function readDatabasesLastVisit() {
  try {
    const value = window.localStorage.getItem(DATABASES_LAST_VISIT_KEY);
    return value && Number.isFinite(Date.parse(value)) ? value : null;
  } catch {
    return null;
  }
}

export function DatabasesView() {
  const queryClient = useQueryClient();
  const entityFilter = useAppStore((state) => state.entityFilter);
  const [searchParams, setSearchParams] = useSearchParams();
  const [isCreating, setIsCreating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [databaseMenu, setDatabaseMenu] = useState<ContextMenuState | null>(null);
  const [currentDatabaseId, setCurrentDatabaseId] = useState<string | null>(() => loadCurrentDatabaseId());
  const [lastVisit] = useState(readDatabasesLastVisit);
  const enteredAt = useRef(new Date().toISOString());
  const [railCollapsed, setRailCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(DATABASE_RAIL_STORAGE_KEY) === "1";
  });

  const {
    data: databases = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["workspace-database-way-in", entityFilter, lastVisit],
    queryFn: () => listWorkspaceDatabaseWayIn({ entity: entityFilter, since: lastVisit }),
  });

  useEffect(() => () => {
    try { window.localStorage.setItem(DATABASES_LAST_VISIT_KEY, enteredAt.current); } catch { /* The next visit remains unknown. */ }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(DATABASE_RAIL_STORAGE_KEY, railCollapsed ? "1" : "0");
  }, [railCollapsed]);

  useEffect(() => {
    saveCurrentDatabaseId(currentDatabaseId);
  }, [currentDatabaseId]);

  const safeDatabases = useMemo(() => {
    const normalized = databases.map((database) => ({
      ...database,
      name: database?.name?.trim() || "Untitled database",
      schema: Array.isArray(database?.schema) ? database.schema : [],
      updated_at: database?.updated_at ?? null,
    }));

    return normalized.sort(
      (left, right) => new Date(right.updated_at ?? 0).getTime() - new Date(left.updated_at ?? 0).getTime(),
    );
  }, [databases]);

  useEffect(() => {
    if (safeDatabases.length === 0) {
      setCurrentDatabaseId(null);
      return;
    }

    const requestedDatabaseId = searchParams.get("database");
    if (requestedDatabaseId && safeDatabases.some((database) => database.id === requestedDatabaseId)) {
      if (currentDatabaseId !== requestedDatabaseId) {
        setCurrentDatabaseId(requestedDatabaseId);
      }
      return;
    }
    if (currentDatabaseId) setCurrentDatabaseId(null);
  }, [currentDatabaseId, safeDatabases, searchParams]);

  const currentDatabase = useMemo(
    () => safeDatabases.find((database) => database.id === currentDatabaseId) ?? null,
    [currentDatabaseId, safeDatabases],
  );
  const canDeleteCurrentDatabase = Boolean(currentDatabase && !isOperationalSystemWorkspaceIcon(currentDatabase.icon));

  function selectDatabase(databaseId: string) {
    setCurrentDatabaseId(databaseId);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("database", databaseId);
      next.delete("view");
      return next;
    }, { replace: true });
  }

  async function handleCreateDatabase() {
    if (isCreating) return;

    try {
      setIsCreating(true);
      const created = await createWorkspaceDatabase({
        taxonomy: entityFilter ? { entity: entityFilter } : undefined,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["workspace-database-way-in"] }),
        queryClient.invalidateQueries({ queryKey: ["workspace-database-catalog"] }),
      ]);
      setCurrentDatabaseId(created.database.id);
      toast.success("Database created");
    } catch (createError) {
      toastError("Database creation failed", createError);
    } finally {
      setIsCreating(false);
    }
  }

  async function handleDeleteCurrentDatabase() {
    if (!currentDatabase || !canDeleteCurrentDatabase || isDeleting) return;

    const nextDatabaseId = safeDatabases.find((database) => database.id !== currentDatabase.id)?.id ?? null;

    try {
      setIsDeleting(true);
      await deleteWorkspaceDatabase(currentDatabase.id);

      const pinResult = removeHomePinsForDatabase(loadHomePins(), currentDatabase.id);
      if (pinResult.removed) {
        saveHomePins(pinResult.pins);
      }
      await removeHomePinsForWorkspaceDatabase(currentDatabase.id);

      setCurrentDatabaseId(nextDatabaseId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["home-pins"] }),
        queryClient.invalidateQueries({ queryKey: ["workspace-database-way-in"] }),
        queryClient.invalidateQueries({ queryKey: ["workspace-database-catalog"] }),
        queryClient.invalidateQueries({ queryKey: ["workspace-database", currentDatabase.id] }),
      ]);
      setDeleteConfirmOpen(false);
      toast.success("Database deleted");
    } catch (deleteError) {
      toastError("Database deletion failed", deleteError);
    } finally {
      setIsDeleting(false);
    }
  }

  if (error) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <div className="border-b border-[var(--border)] bg-[var(--base)] px-6 py-4">
          <span className="text-label">Databases unavailable</span>
          <p className="mt-2 font-ui text-[13px] text-[var(--danger)]">
            {error instanceof Error ? error.message : "The database list could not be loaded."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="db-surface flex h-full flex-col overflow-hidden bg-[var(--base)]">
      <div className="flex shrink-0 items-end justify-between gap-6 border-b border-[var(--border)] bg-[var(--base)] px-6 py-4">
        <span className="text-label">Databases</span>
        <div className="flex items-center gap-2">
          <VentureScope />
          {canDeleteCurrentDatabase ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={(event) => {
                const bounds = event.currentTarget.getBoundingClientRect();
                setDatabaseMenu({ x: bounds.right - 168, y: bounds.bottom + 6 });
              }}
              disabled={isDeleting}
              aria-label="Database actions"
              title="Database actions"
              className="h-8 w-8 p-0"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          ) : null}
          <Button size="sm" onClick={handleCreateDatabase} disabled={isCreating} className="gap-1.5">
            {isCreating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            New database
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 bg-[var(--base)]">
        <CollapsibleRail
          title="Databases"
          width={DATABASE_RAIL_WIDTH_EXPANDED}
          collapsed={railCollapsed}
          onCollapse={() => setRailCollapsed(true)}
          collapseLabel="Collapse database rail"
        >
          <div className="min-h-0 flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center gap-2 p-4 font-ui text-[13px] text-[var(--text-muted)]">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Loading databases...</span>
              </div>
            ) : safeDatabases.length === 0 ? (
              <div className="p-4">
                <p className="font-ui text-[13px] font-medium text-[var(--text)]">No databases yet</p>
                <p className="mt-1 text-[12px] text-[var(--text-muted)]">Create your first database to get started.</p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--border-subtle)]">
                {safeDatabases.map((database) => (
                    <button
                      key={database.id}
                      type="button"
                      onClick={() => selectDatabase(database.id)}
                      className={cn(
                        "group flex w-full items-start gap-3 px-4 py-3 text-left transition-colors duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-[var(--selected-hover)]",
                        currentDatabase?.id === database.id && "bg-[var(--selected)]",
                      )}
                    >
                      <p className="min-w-0 flex-1 truncate font-ui text-[13px] font-medium text-[var(--text)] transition-colors group-hover:text-[var(--accent-text)]">
                        {database.name}
                      </p>
                    </button>
                ))}
              </div>
            )}
          </div>
        </CollapsibleRail>

        <div className="relative min-w-0 flex-1">
          <CollapsedRailTrigger
            visible={railCollapsed}
            onExpand={() => setRailCollapsed(false)}
            label="Expand database rail"
          />

          <div className={cn("h-full overflow-hidden", railCollapsed && "pl-14")}>
            <div className="h-full">
              {isLoading ? (
                <p role="status" className="px-6 py-8 font-ui text-[13px] text-[var(--text-muted)]">Loading databases…</p>
              ) : safeDatabases.length > 0 ? (
                !searchParams.get("database") || !currentDatabase ? (
                  <DatabaseWayIn databases={safeDatabases} lastVisit={lastVisit} onOpen={selectDatabase} />
                ) : currentDatabase ? (
                  <DatabaseEditorView databaseIdOverride={currentDatabase.id} embedded />
                ) : null
              ) : (
                <div className="mx-auto flex h-full max-w-5xl flex-col items-center justify-center gap-3 px-6 py-10 text-center">
                  <p className="text-label">No databases yet</p>
                  <p className="max-w-xl font-ui text-[12px] text-[var(--text-muted)]">
                    Create your first database to get started.
                  </p>
                  <Button size="sm" onClick={handleCreateDatabase} disabled={isCreating} className="gap-1.5">
                    {isCreating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                    New database
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {databaseMenu ? (
        <ContextMenu
          x={databaseMenu.x}
          y={databaseMenu.y}
          items={[
            {
              label: isDeleting ? "Deleting…" : "Delete database",
              icon: <Trash2 className="h-3.5 w-3.5" />,
              variant: "danger",
              onSelect: () => setDeleteConfirmOpen(true),
            },
          ]}
          onClose={() => setDatabaseMenu(null)}
        />
      ) : null}

      <ConfirmDialog
        open={deleteConfirmOpen && !!currentDatabase}
        title="Delete database"
        message={
          currentDatabase
            ? `Delete "${currentDatabase.name}" and all of its views and records? This action cannot be undone.`
            : "This action cannot be undone."
        }
        confirmLabel={isDeleting ? "Deleting…" : "Delete"}
        danger
        onConfirm={() => void handleDeleteCurrentDatabase()}
        onCancel={() => {
          if (isDeleting) return;
          setDeleteConfirmOpen(false);
        }}
      />
    </div>
  );
}

function DatabaseWayIn({ databases, lastVisit, onOpen }: {
  databases: Array<{ id: string; name: string; entity?: string; recordCount: number | null; revisionCount: number | null; revisionCountCapped: boolean }>;
  lastVisit: string | null;
  onOpen: (id: string) => void;
}) {
  const countKnown = databases.every((database) => database.recordCount !== null);
  const revisionsKnown = Boolean(lastVisit) && databases.every((database) => database.revisionCount !== null);
  const changed = databases.filter((database) => (database.revisionCount ?? 0) > 0).length;
  return <section className="@container mx-auto w-full max-w-[960px] overflow-y-auto px-6 py-8" aria-label="Database inventory">
    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">Databases</p>
    <h1 className="mt-4 max-w-[760px] font-ui text-[26px] font-normal leading-[1.3] text-[var(--text)]">
      {countKnown ? `${databases.length} ${databases.length === 1 ? "database" : "databases"}.` : "Database counts are unavailable."}{revisionsKnown && changed ? ` ${changed} ${changed === 1 ? "database changed" : "databases changed"} since your last visit.` : ""}
    </h1>
    <p className="mt-3 max-w-[660px] text-[var(--t-ui)] leading-6 text-[var(--text-mid)]">Open one and the editor takes over. Your data stays in the workspace tables where you put it.</p>
    <div className="mt-9 divide-y divide-[var(--row-line)] border-y border-[var(--row-line)]">
      {databases.map((database) => <button key={database.id} type="button" onClick={() => onOpen(database.id)} className="grid w-full gap-x-5 gap-y-1 py-4 text-left hover:bg-[var(--selected-hover)] @min-[720px]:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)]">
        <span className="text-[var(--t-ui)] text-[var(--text)]">{database.name}</span>
        <span className="font-mono text-[10px] text-[var(--text-muted)]">{database.recordCount === null ? "Record count unavailable" : `${database.recordCount} ${database.recordCount === 1 ? "record" : "records"}`} · {database.entity || "Unscoped"}</span>
        <span className="text-[var(--t-meta)] text-[var(--text-mid)]">{!lastVisit ? "No earlier visit recorded." : database.revisionCount === null ? "Changes unavailable." : `${database.revisionCountCapped ? "At least " : ""}${database.revisionCount} ${database.revisionCount === 1 ? "change" : "changes"} since your last visit.`}</span>
      </button>)}
    </div>
  </section>;
}
