import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
} from "lucide-react";

import { DatabaseEditorView } from "@/views/DatabaseEditor";
import { Button } from "@/components/ui/button";
import { loadCurrentDatabaseId, saveCurrentDatabaseId } from "@/lib/current-database";
import { createWorkspaceDatabase, listWorkspaceDatabaseCatalog, listWorkspaceDatabases } from "@/lib/data";
import { toast, toastError } from "@/lib/toast";
import { cn, formatDateTime } from "@/lib/utils";

const DATABASE_RAIL_STORAGE_KEY = "intelizen:databases-rail-collapsed";
const DATABASE_RAIL_WIDTH_EXPANDED = 280;

export function DatabasesView() {
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
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
  const { data: catalog = [] } = useQuery({
    queryKey: ["workspace-database-catalog"],
    queryFn: listWorkspaceDatabaseCatalog,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(DATABASE_RAIL_STORAGE_KEY, railCollapsed ? "1" : "0");
  }, [railCollapsed]);

  useEffect(() => {
    saveCurrentDatabaseId(currentDatabaseId);
  }, [currentDatabaseId]);

  const safeDatabases = useMemo(() => {
    const catalogById = new Map(catalog.map((entry) => [entry.id, entry]));
    const normalized = databases.map((database) => {
      const linked = catalogById.get(database.id);
      const schema = Array.isArray(database?.schema) ? database.schema : [];
      return {
        ...database,
        name: database?.name?.trim() || "Untitled database",
        schema,
        updated_at: database?.updated_at ?? null,
        recordCount: linked?.records.length ?? 0,
        relationCount: schema.filter((field) => field.type === "relation").length,
      };
    });

    return normalized.sort(
      (left, right) => new Date(right.updated_at ?? 0).getTime() - new Date(left.updated_at ?? 0).getTime(),
    );
  }, [catalog, databases]);

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
        <div className="flex flex-col gap-2">
          <span className="text-label">Databases</span>
          <p className="font-ui text-[12px] text-[var(--overlay-1)]">
            Use the left rail to open a database. Home now owns pinned views and dashboard layout.
          </p>
        </div>

        <Button size="sm" onClick={handleCreateDatabase} disabled={isCreating} className="gap-1.5">
          {isCreating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          New database
        </Button>
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
                <div className="min-w-0">
                  <div className="text-label">Databases</div>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-[var(--overlay-1)]">
                    <span>{safeDatabases.length}</span>
                    <span aria-hidden className="text-[var(--overlay-0)]">·</span>
                    <span>active menu</span>
                  </div>
                </div>
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
                  <p className="mt-1 text-[12px] text-[var(--overlay-1)]">
                    Create your first database to start building structured views.
                  </p>
                </div>
              )
            ) : (
              <div className="divide-y divide-[var(--border-subtle)]">
                {safeDatabases.map((database) => {
                  const fieldPreview = database.schema.slice(0, 3).map((field) => field.name).join(" · ");
                  const extraFieldCount = Math.max(database.schema.length - 3, 0);

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
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-ui text-[13px] font-medium text-[var(--text)] transition-colors group-hover:text-[var(--accent)]">
                            {database.name}
                          </p>
                          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[var(--overlay-1)] transition-colors duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:text-[var(--accent)]" />
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--subtext-0)]">
                          <span>{database.recordCount} rec</span>
                          <span aria-hidden className="text-[var(--overlay-0)]">·</span>
                          <span>{database.schema.length} fields</span>
                          <span aria-hidden className="text-[var(--overlay-0)]">·</span>
                          <span>{database.relationCount} rel</span>
                        </div>

                        <div className="mt-1 truncate text-[11px] text-[var(--overlay-1)]">
                          {fieldPreview}
                          {extraFieldCount > 0 ? ` · +${extraFieldCount}` : ""}
                        </div>

                        <div className="mt-1 text-[10px] text-[var(--overlay-1)]">
                          Updated {formatDateTime(database.updated_at)}
                        </div>
                      </div>
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
                    Create your first database here, then use saved views inside it to pin the important ones back to Home.
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
    </div>
  );
}
