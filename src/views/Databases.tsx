import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Loader2, Plus } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { createWorkspaceDatabase, listWorkspaceDatabaseCatalog, listWorkspaceDatabases } from "@/lib/data";
import { toast, toastError } from "@/lib/toast";
import { cn, formatDateTime } from "@/lib/utils";

export function DatabasesView() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [sortBy, setSortBy] = useState<"updated" | "name" | "records">("updated");

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

    return normalized.sort((left, right) => {
      if (sortBy === "name") {
        return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
      }
      if (sortBy === "records") {
        return right.recordCount - left.recordCount || left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
      }
      return new Date(right.updated_at ?? 0).getTime() - new Date(left.updated_at ?? 0).getTime();
    });
  }, [catalog, databases, sortBy]);

  async function handleCreateDatabase() {
    if (isCreating) return;

    try {
      setIsCreating(true);
      const created = await createWorkspaceDatabase();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["workspace-databases"] }),
        queryClient.invalidateQueries({ queryKey: ["workspace-database-catalog"] }),
      ]);
      toast.success("Database created");
      navigate(`/databases/${created.database.id}`);
    } catch (error) {
      toastError("Database creation failed", error);
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
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-end justify-between gap-6 border-b border-[var(--border)] bg-[var(--base)] px-6 py-4">
        <div className="flex flex-col gap-3">
          <span className="text-label">Databases</span>
          <div className="flex items-center gap-1">
            {(["updated", "records", "name"] as const).map((option) => {
              const labels: Record<typeof option, string> = {
                updated: "Updated",
                records: "Records",
                name: "Name",
              };

              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setSortBy(option)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-ui text-[12px] font-medium",
                    "transition-colors duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]",
                    sortBy === option
                      ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                      : "text-[var(--subtext-0)] hover:bg-[var(--surface-wash)] hover:text-[var(--text)]",
                  )}
                >
                  <span>{labels[option]}</span>
                </button>
              );
            })}
            <span className="ml-2 rounded-md border border-[var(--border)] px-2 py-1 font-mono text-[10px] text-[var(--overlay-1)]">
              {safeDatabases.length}
            </span>
          </div>
        </div>

        <Button size="sm" onClick={handleCreateDatabase} disabled={isCreating} className="gap-1.5">
          {isCreating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          New database
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto bg-[var(--base)]">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 p-10 font-ui text-[13px] text-[var(--overlay-1)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading databases...
          </div>
        ) : safeDatabases.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-16 text-center">
            <p className="text-label">No databases yet</p>
            <p className="font-ui text-[12px] text-[var(--overlay-1)]">
              Create your first database to start building structured records and views.
            </p>
            <Button size="sm" onClick={handleCreateDatabase} disabled={isCreating} className="mt-2 gap-1.5">
              {isCreating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              Create database
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-subtle)]">
            {safeDatabases.map((database) => {
              const fieldPreview = database.schema.slice(0, 4).map((field) => field.name).join(" · ");
              const extraFieldCount = Math.max(database.schema.length - 4, 0);

              return (
                <Link
                  key={database.id}
                  to={`/databases/${database.id}`}
                  className="group relative flex w-full items-start gap-4 px-6 py-4 transition-colors duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-[color-mix(in_srgb,var(--surface-wash)_82%,var(--accent-soft)_18%)]"
                >
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 left-0 w-[2px] bg-[var(--accent)] opacity-0 transition-opacity duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:opacity-100"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-ui text-[14px] font-medium text-[var(--text)] transition-colors group-hover:text-[var(--accent)]">
                        {database.name}
                      </p>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[var(--overlay-1)] transition-colors duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:text-[var(--accent)]" />
                      <span className="shrink-0 font-mono text-[10px] text-[var(--overlay-1)]">
                        {database.recordCount} rec
                      </span>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--subtext-0)]">
                      <span>{database.schema.length} {database.schema.length === 1 ? "field" : "fields"}</span>
                      <span aria-hidden className="text-[var(--overlay-0)]">·</span>
                      <span>{database.relationCount} {database.relationCount === 1 ? "relation" : "relations"}</span>
                      <span aria-hidden className="text-[var(--overlay-0)]">·</span>
                      <span>Updated {formatDateTime(database.updated_at)}</span>
                    </div>

                    {fieldPreview ? (
                      <div className="mt-1.5 truncate font-ui text-[11px] text-[var(--overlay-1)]">
                        {fieldPreview}
                        {extraFieldCount > 0 ? ` · +${extraFieldCount} more` : ""}
                      </div>
                    ) : null}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
