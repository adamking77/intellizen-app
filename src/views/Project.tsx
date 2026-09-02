import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { FileText, Loader2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { QueryState } from "@/components/ui/query-state";
import { getDocumentsWorkspaceBundle, listInvestigations } from "@/lib/data";
import { createPortableDocument } from "@/lib/document-persistence";
import { DOCUMENTS_DB_FIELDS, quickNoteTitle } from "@/lib/documents";
import { locate } from "@/lib/hierarchy";
import { breadcrumb, findProjectNode, projectDocuments, shortenHome } from "@/lib/project-center";
import { toast, toastError } from "@/lib/toast";
import { useHierarchy } from "@/lib/use-hierarchy";
import { useAppStore } from "@/store";
import { CENTER_DOCS_QUERY_KEY } from "@/views/Unit";

const InvestigationView = lazy(() => import("@/views/Investigation").then((m) => ({ default: m.InvestigationView })));
const ProjectsView = lazy(() => import("@/views/Projects").then((m) => ({ default: m.ProjectsView })));

type Tab = "files" | "case";

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function LazyFallback() {
  return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="h-4 w-4 animate-spin text-[var(--accent)]" />
    </div>
  );
}

/** The project room: Files now, Case for migrated intel work. */
export function ProjectView() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [, setSearchParams] = useSearchParams();
  const setPendingProjectSelectionId = useAppStore((s) => s.setPendingProjectSelectionId);
  const { tree, isLoading, error } = useHierarchy();
  const [tab, setTab] = useState<Tab>("files");

  const node = findProjectNode(tree, id);
  const scoped = locate(tree, { kind: "project", id });
  const notFound = !isLoading && !error && !node ? "No project with this id is in the tree." : undefined;
  const investigationId = node?.legacy_investigation_id ?? null;
  const legacyProjectId = node?.legacy_project_id ?? null;
  const hasCase = investigationId != null || legacyProjectId != null;

  useEffect(() => setTab("files"), [id]);

  const docs = useQuery({ queryKey: CENTER_DOCS_QUERY_KEY, queryFn: () => getDocumentsWorkspaceBundle() });
  const files = useMemo(() => projectDocuments(docs.data?.records ?? [], id), [docs.data?.records, id]);

  const investigations = useQuery({
    queryKey: ["investigations", "center"],
    queryFn: () => listInvestigations(),
    enabled: tab === "case" && investigationId != null,
  });
  const caseId = investigations.data?.find((inv) => inv.id === investigationId)?.case_id ?? null;
  const caseMissing = tab === "case" && investigationId != null && investigations.data && !caseId
    ? "This project's case record is no longer in the investigations table."
    : undefined;

  useEffect(() => {
    if (tab !== "case") return;
    if (caseId) setSearchParams({ case: caseId }, { replace: true });
    else if (investigationId == null && legacyProjectId != null) setPendingProjectSelectionId(legacyProjectId);
  }, [tab, caseId, investigationId, legacyProjectId, setSearchParams, setPendingProjectSelectionId]);

  const create = useMutation({
    mutationFn: async () => {
      if (!docs.data?.database.id) throw new Error("Documents database is not ready.");
      const title = quickNoteTitle();
      return createPortableDocument({
        databaseId: docs.data.database.id,
        title,
        body: `# ${title}\n`,
        entity: "genzen",
        author: "Adam",
        fields: { [DOCUMENTS_DB_FIELDS.stage]: "Draft", [DOCUMENTS_DB_FIELDS.project]: id },
      });
    },
    onSuccess: async ({ record, warning }) => {
      await queryClient.invalidateQueries({ queryKey: ["docs-workspace-bundle"] });
      if (warning) toast.info("Document created in Supabase only", { description: warning });
      navigate(`/docs?record=${record.id}&project=${id}`);
    },
    onError: (err) => toastError("Couldn't create document", err),
  });

  const tabs: Tab[] = hasCase ? ["files", "case"] : ["files"];

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--base)]">
      <header className="flex shrink-0 flex-wrap items-end justify-between gap-3 border-b border-[var(--border)] px-5 py-3">
        <div className="min-w-0 flex-1">
          {scoped && scoped.path.length > 0 ? <p className="truncate text-meta">{breadcrumb(scoped)}</p> : null}
          <h1 className="truncate font-ui text-[17px] font-semibold text-[var(--text)]">{node?.name ?? "Project"}</h1>
          {node && node.folders.length > 0 ? (
            <p className="truncate font-mono text-[11px] text-[var(--overlay-1)]" title={node.folders.join("\n")}>
              {node.folders.map(shortenHome).join("  ·  ")}
            </p>
          ) : null}
        </div>
        {node ? (
          <div className="flex items-center gap-1.5" role="tablist">
            {tabs.map((t) => (
              <Button
                key={t}
                size="sm"
                role="tab"
                aria-selected={tab === t}
                variant={tab === t ? "accent-soft" : "ghost"}
                onClick={() => setTab(t)}
              >
                {t === "files" ? "Files" : "Case"}
              </Button>
            ))}
          </div>
        ) : null}
      </header>

      {tab === "files" || !node ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <QueryState
            isLoading={isLoading || (Boolean(node) && docs.isLoading)}
            error={error ?? notFound ?? docs.error}
            isEmpty={files.length === 0}
            loadingLabel="Loading files"
            errorTitle="Project unavailable"
            emptyTitle="No documents yet"
            emptyDescription="Documents created here are linked to this project and open in Docs."
            emptyAction={<NewDocumentButton pending={create.isPending} onClick={() => create.mutate()} />}
            onRetry={docs.error ? () => void docs.refetch() : undefined}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="text-label">{files.length} document{files.length === 1 ? "" : "s"}</span>
              <NewDocumentButton pending={create.isPending} onClick={() => create.mutate()} />
            </div>
            <div className="divide-y divide-[var(--border-subtle)] rounded-xl border border-[var(--border)]">
              {files.map((file) => {
                const title = String(file.fields[DOCUMENTS_DB_FIELDS.title] ?? "").trim() || "Untitled document";
                const type = String(file.fields[DOCUMENTS_DB_FIELDS.docType] ?? "");
                const updated = formatDate(String(file.fields[DOCUMENTS_DB_FIELDS.updatedAt] ?? file.updated_at));
                return (
                  <button
                    key={file.id}
                    type="button"
                    onClick={() => navigate(`/docs?record=${file.id}&project=${id}`)}
                    className="group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--surface-wash)]"
                  >
                    <FileText className="h-3.5 w-3.5 shrink-0 text-[var(--overlay-1)]" />
                    <span className="min-w-0 flex-1 truncate font-ui text-[13px] font-medium text-[var(--text)] group-hover:text-[var(--accent)]">
                      {title}
                    </span>
                    {type ? <span className="shrink-0 text-meta">{type}</span> : null}
                    {updated ? <span className="shrink-0 font-mono text-[11px] text-[var(--overlay-1)]">{updated}</span> : null}
                  </button>
                );
              })}
            </div>
          </QueryState>
        </div>
      ) : investigationId != null && !caseId ? (
        <div className="p-5">
          <QueryState
            isLoading={investigations.isLoading}
            error={investigations.error ?? caseMissing}
            isEmpty={false}
            loadingLabel="Loading case"
            errorTitle="Case unavailable"
            onRetry={() => void investigations.refetch()}
          >
            {null}
          </QueryState>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <Suspense fallback={<LazyFallback />}>
            {investigationId != null ? <InvestigationView /> : <ProjectsView />}
          </Suspense>
        </div>
      )}
    </div>
  );
}

function NewDocumentButton({ pending, onClick }: { pending: boolean; onClick: () => void }) {
  return (
    <Button size="sm" className="gap-1.5" onClick={onClick} disabled={pending}>
      {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
      New document
    </Button>
  );
}
