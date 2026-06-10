import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DatabaseEditorView } from "@/views/DatabaseEditor";
import { Button } from "@/components/ui/button";
import { loadCurrentDatabaseId, saveCurrentDatabaseId } from "@/lib/current-database";
import { loadHomePins, removeHomePinsForDatabase, saveHomePins } from "@/lib/home-pins";
import {
  createWorkspaceDatabase,
  deleteWorkspaceDatabase,
  isOperationalSystemWorkspaceIcon,
  listWorkspaceDatabases,
} from "@/lib/data";
import { toast, toastError } from "@/lib/toast";
import { cn } from "@/lib/utils";

const DATABASE_RAIL_STORAGE_KEY = "intelizen:databases-rail-collapsed";
const DATABASE_RAIL_WIDTH_EXPANDED = 280;

export function DatabasesView() {
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [currentDatabaseId, setCurrentDatabaseId] = useState<string | null>(() => loadCurrentDatabaseId());
  const [railCollapsed, setRailCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(DATABASE_RAIL_STORAGE_KEY) === "1";
  });

  const {
    data: databases = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["workspace-databases"],
    queryFn: listWorkspaceDatabases,
  });

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

    const currentExists = currentDatabaseId
      ? safeDatabases.some((database) => database.id === currentDatabaseId)
      : false;

    if (currentExists) return;
    setCurrentDatabaseId(safeDatabases[0]?.id ?? null);
  }, [currentDatabaseId, safeDatabases]);

  const currentDatabase = useMemo(
    () => safeDatabases.find((database) => database.id === currentDatabaseId) ?? safeDatabases[0] ?? null,
    [currentDatabaseId, safeDatabases],
  );
  const canDeleteCurrentDatabase = Boolean(currentDatabase && !isOperationalSystemWorkspaceIcon(currentDatabase.icon));

  async function handleCreateDatabase() {
    if (isCreating) return;

    try {
      setIsCreating(true);
      const created = await createWorkspaceDatabase();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["workspace-databases"] }),
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

      setCurrentDatabaseId(nextDatabaseId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["workspace-databases"] }),
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
    <div className="flex h-full flex-col overflow-hidden bg-[var(--base)]">
      <div className="flex shrink-0 items-end justify-between gap-6 border-b border-[var(--border)] bg-[var(--base)] px-6 py-4">
        <span className="text-label">Databases</span>
        <div className="flex items-center gap-2">
          {canDeleteCurrentDatabase ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDeleteConfirmOpen(true)}
              disabled={isDeleting}
              className="gap-1.5 text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] hover:text-[var(--danger)]"
            >
              <Trash2 className="h-3 w-3" />
              {isDeleting ? "Deleting…" : "Delete database"}
            </Button>
          ) : null}
          <Button size="sm" onClick={handleCreateDatabase} disabled={isCreating} className="gap-1.5">
            {isCreating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            New database
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 bg-[var(--base)]">
        <aside
          style={{ width: railCollapsed ? 0 : DATABASE_RAIL_WIDTH_EXPANDED }}
          className={cn(
            "flex shrink-0 flex-col overflow-hidden bg-[var(--base)]",
            "transition-[width] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
            !railCollapsed && "border-r border-[var(--border)]",
          )}
        >
          <div
            className={cn(
              "flex h-14 shrink-0 items-center border-b border-[var(--border)]",
              railCollapsed ? "justify-center px-0" : "justify-between px-4",
            )}
          >
            {railCollapsed ? (
              <button
                type="button"
                onClick={() => setRailCollapsed(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
                aria-label="Expand database rail"
                title="Expand databases"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <>
                <div />
                <button
                  type="button"
                  onClick={() => setRailCollapsed(true)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
                  aria-label="Collapse database rail"
                  title="Collapse databases"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              </>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {isLoading ? (
              <div className={cn("flex items-center gap-2 p-4 font-ui text-[13px] text-[var(--overlay-1)]", railCollapsed && "justify-center p-3")}>
                <Loader2 className="h-4 w-4 animate-spin" />
                {!railCollapsed ? <span>Loading databases...</span> : null}
              </div>
            ) : safeDatabases.length === 0 ? (
              railCollapsed ? (
                <div className="flex justify-center p-3">
                  <span className="rounded-md border border-[var(--border)] px-2 py-1 font-mono text-[10px] text-[var(--overlay-1)]">
                    0
                  </span>
                </div>
              ) : (
                <div className="p-4">
                  <p className="font-ui text-[13px] font-medium text-[var(--text)]">No databases yet</p>
                  <p className="mt-1 text-[12px] text-[var(--overlay-1)]">Create your first database to get started.</p>
                </div>
              )
            ) : (
              <div className="divide-y divide-[var(--border-subtle)]">
                {safeDatabases.map((database) => {
                  if (railCollapsed) {
                    return (
                      <button
                        key={database.id}
                        type="button"
                        title={database.name}
                        onClick={() => setCurrentDatabaseId(database.id)}
                        className={cn(
                          "group flex h-14 w-full items-center justify-center transition-colors duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-[color-mix(in_srgb,var(--surface-wash)_82%,var(--accent-soft)_18%)]",
                          currentDatabase?.id === database.id && "bg-[var(--accent-soft)]",
                        )}
                      >
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--base)] font-ui text-[11px] font-semibold uppercase text-[var(--text)] transition-colors group-hover:border-[var(--accent-border)] group-hover:text-[var(--accent)]">
                          {database.name.slice(0, 1)}
                        </span>
                      </button>
                    );
                  }

                  return (
                    <button
                      key={database.id}
                      type="button"
                      onClick={() => setCurrentDatabaseId(database.id)}
                      className={cn(
                        "group relative flex w-full items-start gap-3 px-4 py-3 text-left transition-colors duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-[color-mix(in_srgb,var(--surface-wash)_82%,var(--accent-soft)_18%)]",
                        currentDatabase?.id === database.id && "bg-[var(--accent-soft)]",
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "pointer-events-none absolute inset-y-0 left-0 w-[2px] bg-[var(--accent)] transition-opacity duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]",
                          currentDatabase?.id === database.id ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                        )}
                      />
                      <p className="min-w-0 flex-1 truncate font-ui text-[13px] font-medium text-[var(--text)] transition-colors group-hover:text-[var(--accent)]">
                        {database.name}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        <div className="relative min-w-0 flex-1">
          {railCollapsed ? (
            <button
              type="button"
              onClick={() => setRailCollapsed(false)}
              className="absolute left-3 top-3 z-20 inline-flex h-8 w-8 items-center justify-center rounded-md bg-[var(--base)] text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
              aria-label="Expand database rail"
              title="Show databases"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : null}

          <div className={cn("h-full overflow-hidden", railCollapsed && "pl-14")}>
            <div className="h-full">
              {safeDatabases.length > 0 ? (
                currentDatabase ? (
                  <DatabaseEditorView databaseIdOverride={currentDatabase.id} embedded />
                ) : null
              ) : (
                <div className="mx-auto flex h-full max-w-5xl flex-col items-center justify-center gap-3 px-6 py-10 text-center">
                  <p className="text-label">No databases yet</p>
                  <p className="max-w-xl font-ui text-[12px] text-[var(--overlay-1)]">
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
