import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Database, Loader2, Plus, Search } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createWorkspaceDatabase, listWorkspaceDatabaseCatalog, listWorkspaceDatabases } from "@/lib/data";
import { toast, toastError } from "@/lib/toast";
import { formatDateTime } from "@/lib/utils";

export function DatabasesView() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [search, setSearch] = useState("");
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
        headerCount: Array.isArray(database?.header_field_ids) ? database.header_field_ids.length : 0,
      };
    });

    const query = search.trim().toLowerCase();
    const filtered = query
      ? normalized.filter((database) => {
          const haystack = [
            database.name,
            ...database.schema.map((field) => field.name),
          ]
            .join(" ")
            .toLowerCase();
          return haystack.includes(query);
        })
      : normalized;

    return filtered.sort((left, right) => {
      if (sortBy === "name") {
        return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
      }
      if (sortBy === "records") {
        return right.recordCount - left.recordCount || left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
      }
      return new Date(right.updated_at ?? 0).getTime() - new Date(left.updated_at ?? 0).getTime();
    });
  }, [catalog, databases, search, sortBy]);

  const stats = useMemo(() => {
    const totalRecords = safeDatabases.reduce((sum, database) => sum + database.recordCount, 0);
    const totalFields = safeDatabases.reduce((sum, database) => sum + database.schema.length, 0);
    const lastUpdated = safeDatabases[0]?.updated_at ?? null;
    return {
      totalDatabases: safeDatabases.length,
      totalRecords,
      totalFields,
      lastUpdated,
    };
  }, [safeDatabases]);

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

  return (
    <div className="h-full overflow-y-auto bg-[var(--base)]">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-8 py-10">
        <div className="flex items-end justify-between gap-6">
          <div className="space-y-2">
            <div className="font-ui text-[12px] font-semibold uppercase tracking-[0.2em] text-[var(--overlay-1)]">
              Workspace
            </div>
            <h1 className="text-[34px] font-semibold tracking-[-0.04em] text-[var(--text)]">
              Databases
            </h1>
            <p className="max-w-2xl text-[14px] leading-6 text-[var(--subtext-0)]">
              Supabase-backed structured workspaces for planning, tracking, and relation-heavy research.
            </p>
          </div>
          <Button onClick={handleCreateDatabase} disabled={isCreating}>
            {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            New database
          </Button>
        </div>

        {!isLoading && !error ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Databases"
              value={String(stats.totalDatabases)}
              detail="Structured workspaces"
            />
            <StatCard
              label="Records"
              value={String(stats.totalRecords)}
              detail="Across all databases"
            />
            <StatCard
              label="Fields"
              value={String(stats.totalFields)}
              detail="Schema properties live now"
            />
            <StatCard
              label="Last updated"
              value={formatDateTime(stats.lastUpdated)}
              detail="Most recent database change"
            />
          </div>
        ) : null}

        {isLoading ? (
          <div className="flex h-64 items-center justify-center text-[13px] text-[var(--subtext-0)]">
            Loading databases...
          </div>
        ) : null}

        {error ? (
          <Card>
            <CardHeader>
              <CardTitle>Databases unavailable</CardTitle>
              <CardDescription>
                {error instanceof Error ? error.message : "The database list could not be loaded."}
              </CardDescription>
            </CardHeader>
          </Card>
        ) : null}

        {!isLoading && !error && safeDatabases.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No databases yet</CardTitle>
              <CardDescription>
                Start with one table-backed database, then add saved views, schema, and relations inside the editor.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={handleCreateDatabase} disabled={isCreating}>
                {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Create first database
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {!isLoading && !error && safeDatabases.length > 0 ? (
          <>
            <div className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--mantle)] p-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-1 items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--base)] px-3">
                <Search className="h-4 w-4 text-[var(--overlay-1)]" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search databases or fields"
                  className="border-0 bg-transparent px-0 shadow-none focus:border-0"
                />
              </div>

              <div className="flex items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--base)] p-1">
                {(["updated", "records", "name"] as const).map((option) => {
                  const labels: Record<typeof option, string> = { updated: "Updated", records: "Records", name: "Name" };
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setSortBy(option)}
                      className={`rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors ${
                        sortBy === option
                          ? "bg-[var(--accent-soft)] text-[var(--text)]"
                          : "text-[var(--subtext-0)] hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
                      }`}
                    >
                      {labels[option]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {safeDatabases.map((database) => (
              <Link key={database.id} to={`/databases/${database.id}`}>
                <Card
                  interactive
                  className="h-full bg-[var(--mantle)] transition-transform duration-150 hover:-translate-y-0.5"
                >
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--base)] text-[var(--accent)]">
                        <Database className="h-4 w-4" />
                      </div>
                      <ArrowRight className="mt-1 h-4 w-4 text-[var(--overlay-1)]" />
                    </div>
                    <CardTitle className="mt-4">{database.name}</CardTitle>
                    <CardDescription>
                      {database.recordCount} {database.recordCount === 1 ? "record" : "records"} ·{" "}
                      {database.schema.length} {database.schema.length === 1 ? "field" : "fields"} · updated{" "}
                      {formatDateTime(database.updated_at)}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-2">
                      <MiniStat label="Fields" value={String(database.schema.length)} />
                      <MiniStat label="Relations" value={String(database.relationCount)} />
                      <MiniStat label="Headers" value={String(database.headerCount)} />
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {database.schema.slice(0, 4).map((field) => (
                        <span
                          key={field.id}
                          className="rounded-full border border-[var(--border)] bg-[var(--surface-wash)] px-2.5 py-1 text-[11px] font-medium text-[var(--subtext-0)]"
                        >
                          {field.name}
                        </span>
                      ))}
                      {database.schema.length > 4 ? (
                        <span className="rounded-full border border-dashed border-[var(--border)] px-2.5 py-1 text-[11px] font-medium text-[var(--overlay-1)]">
                          +{database.schema.length - 4} more
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-4 text-[12px] font-medium text-[var(--accent)]">
                      Open editor
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card className="bg-[var(--mantle)]">
      <CardHeader className="pb-2">
        <CardDescription className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
          {label}
        </CardDescription>
        <CardTitle className="text-[28px]">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-[13px] text-[var(--subtext-0)]">{detail}</div>
      </CardContent>
    </Card>
  );
}

function MiniStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--base)] px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--overlay-1)]">
        {label}
      </div>
      <div className="mt-1 text-[16px] font-semibold tracking-[-0.02em] text-[var(--text)]">{value}</div>
    </div>
  );
}
