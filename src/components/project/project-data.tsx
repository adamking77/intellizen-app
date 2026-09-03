import { useQuery } from "@tanstack/react-query";
import { Database, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { ProjectTabFrame } from "@/components/project/project-board";
import { QueryState } from "@/components/ui/query-state";
import { listWorkspaceDatabaseCatalog } from "@/lib/data";
import { linkedWorkspaceRecords } from "@/lib/project-room";

export function ProjectData({ projectId, legacyProjectId }: { projectId: string; legacyProjectId: number | null }) {
  const navigate = useNavigate();
  const catalog = useQuery({
    queryKey: ["workspace-database-catalog", "project-room"],
    queryFn: () => listWorkspaceDatabaseCatalog(),
  });
  const records = linkedWorkspaceRecords(catalog.data ?? [], projectId, legacyProjectId);

  return (
    <ProjectTabFrame>
      <QueryState
        isLoading={catalog.isLoading}
        error={catalog.error}
        isEmpty={records.length === 0}
        loadingLabel="Loading linked data"
        errorTitle="Linked data unavailable"
        emptyTitle="No linked records"
        emptyDescription="Records that link to this project appear here automatically."
        onRetry={() => void catalog.refetch()}
      >
        <div className="divide-y divide-[var(--border-subtle)] rounded-xl border border-[var(--border)]">
          {records.map((record) => (
            <button
              key={`${record.databaseId}:${record.recordId}`}
              type="button"
              onClick={() => navigate(`/databases/${record.databaseId}?record=${record.recordId}`)}
              className="group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--surface-wash)]"
            >
              <Database className="h-3.5 w-3.5 shrink-0 text-[var(--overlay-1)]" />
              <span className="min-w-0 flex-1 truncate font-ui text-[13px] font-medium text-[var(--text)] group-hover:text-[var(--accent)]">
                {record.title}
              </span>
              {record.status ? <span className="text-meta">{record.status}</span> : null}
              <span className="text-meta">{record.databaseName}</span>
              <ExternalLink className="h-3 w-3 shrink-0 text-[var(--overlay-1)]" />
            </button>
          ))}
        </div>
      </QueryState>
    </ProjectTabFrame>
  );
}
