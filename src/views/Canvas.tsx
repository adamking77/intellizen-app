import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FilePlus2, Loader2, PanelLeftClose, PanelLeftOpen, Trash2 } from "lucide-react";

import { CanvasEditor } from "@/components/canvas/CanvasEditor";
import { createEmptyCanvasDocument } from "@/components/canvas/CanvasSerializer";
import {
  createCanvasDocument,
  deleteCanvasDocument,
  getCanvasDocument,
  listCanvasDocuments,
  updateCanvasDocument,
  updateCanvasDocumentContent,
} from "@/lib/data";
import { toast, toastError } from "@/lib/toast";
import type { CanvasDocumentData, CanvasDocumentSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

type SaveStatus = "idle" | "dirty" | "saving" | "error";

function nextCanvasName(canvases: CanvasDocumentSummary[]) {
  const base = "Untitled canvas";
  if (!canvases.some((canvas) => canvas.name === base)) {
    return base;
  }

  let index = 2;
  while (canvases.some((canvas) => canvas.name === `${base} ${index}`)) {
    index += 1;
  }

  return `${base} ${index}`;
}

function formatSaveStatus(status: SaveStatus) {
  switch (status) {
    case "dirty":
      return "Unsaved";
    case "saving":
      return "Saving";
    case "error":
      return "Save error";
    default:
      return "Saved";
  }
}

export function CanvasView() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draftDocument, setDraftDocument] = useState<CanvasDocumentData | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [isCreating, setIsCreating] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const { data: canvases = [], isLoading: loadingCanvases } = useQuery({
    queryKey: ["canvas-documents"],
    queryFn: listCanvasDocuments,
  });

  useEffect(() => {
    if (canvases.length === 0) {
      setSelectedId(null);
      return;
    }

    if (selectedId == null || !canvases.some((canvas) => canvas.id === selectedId)) {
      setSelectedId(canvases[0].id);
    }
  }, [canvases, selectedId]);

  const { data: selectedCanvas, isLoading: loadingCanvas } = useQuery({
    queryKey: ["canvas-document", selectedId],
    queryFn: () => getCanvasDocument(selectedId as number),
    enabled: selectedId != null,
  });

  useEffect(() => {
    if (!selectedCanvas) {
      setDraftDocument(null);
      setTitleDraft("");
      setSaveStatus("idle");
      return;
    }

    setDraftDocument(selectedCanvas.content_json ?? createEmptyCanvasDocument());
    setTitleDraft(selectedCanvas.name);
    setSaveStatus("idle");
  }, [selectedCanvas]);

  useEffect(() => {
    if (!selectedId || !draftDocument || saveStatus !== "dirty") {
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        setSaveStatus("saving");
        const updated = await updateCanvasDocumentContent(selectedId, draftDocument);
        queryClient.setQueryData(["canvas-document", selectedId], updated);
        queryClient.setQueryData(["canvas-documents"], (prev: CanvasDocumentSummary[] | undefined) =>
          prev?.map((item) =>
            item.id === updated.id ? { ...item, updated_at: updated.updated_at, name: updated.name } : item,
          ) ?? prev,
        );
        setSaveStatus("idle");
      } catch (error) {
        setSaveStatus("error");
        toastError("Canvas save failed", error);
      }
    }, 500);

    return () => window.clearTimeout(timer);
  }, [draftDocument, queryClient, saveStatus, selectedId]);

  const currentSummary = useMemo(
    () => canvases.find((canvas) => canvas.id === selectedId) ?? null,
    [canvases, selectedId],
  );

  async function handleCreateCanvas() {
    if (isCreating) return;

    try {
      setIsCreating(true);
      const created = await createCanvasDocument({
        name: nextCanvasName(canvases),
        contentJson: createEmptyCanvasDocument(),
      });
      queryClient.setQueryData(["canvas-documents"], (prev: CanvasDocumentSummary[] | undefined) => [
        {
          id: created.id,
          name: created.name,
          project_id: created.project_id,
          project_record_id: created.project_record_id,
          case_id: created.case_id,
          created_at: created.created_at,
          updated_at: created.updated_at,
        },
        ...(prev ?? []),
      ]);
      queryClient.setQueryData(["canvas-document", created.id], created);
      setSelectedId(created.id);
      toast.success("Canvas created");
    } catch (error) {
      toastError("Canvas creation failed", error);
    } finally {
      setIsCreating(false);
    }
  }

  async function commitRename() {
    if (!selectedCanvas || isRenaming) return;

    const nextName = titleDraft.trim();
    if (!nextName || nextName === selectedCanvas.name) {
      setTitleDraft(selectedCanvas.name);
      return;
    }

    try {
      setIsRenaming(true);
      const updated = await updateCanvasDocument(selectedCanvas.id, { name: nextName });
      queryClient.setQueryData(["canvas-document", selectedCanvas.id], updated);
      queryClient.setQueryData(["canvas-documents"], (prev: CanvasDocumentSummary[] | undefined) =>
        prev?.map((item) =>
          item.id === updated.id ? { ...item, name: updated.name, updated_at: updated.updated_at } : item,
        ) ?? prev,
      );
    } catch (error) {
      setTitleDraft(selectedCanvas.name);
      toastError("Rename failed", error);
    } finally {
      setIsRenaming(false);
    }
  }

  async function handleDeleteCanvas(canvasId: number) {
    if (isDeleting) return;
    const canvas = canvases.find((item) => item.id === canvasId);
    if (!canvas) return;

    try {
      setIsDeleting(true);
      await deleteCanvasDocument(canvasId);
      queryClient.setQueryData(["canvas-documents"], (prev: CanvasDocumentSummary[] | undefined) =>
        prev?.filter((item) => item.id !== canvasId) ?? prev,
      );
      queryClient.removeQueries({ queryKey: ["canvas-document", canvasId] });
      if (selectedId === canvasId) {
        const next = canvases.find((item) => item.id !== canvasId);
        setSelectedId(next?.id ?? null);
      }
      toast.success("Canvas deleted");
    } catch (error) {
      toastError("Delete failed", error);
    } finally {
      setIsDeleting(false);
    }
  }

  function handleDocumentChange(next: CanvasDocumentData) {
    setDraftDocument(next);
    setSaveStatus("dirty");
  }

  return (
    <div className="flex h-full min-h-0 bg-[var(--base)]">
      <aside
        className={cn(
          "flex shrink-0 flex-col border-r border-[var(--border)] bg-[var(--mantle)] overflow-hidden transition-[width] duration-200",
          sidebarOpen ? "w-[284px]" : "w-10",
        )}
      >
        <div
          className={cn(
            "flex h-14 shrink-0 items-center border-b border-[var(--border)]",
            sidebarOpen ? "w-[284px] justify-between px-4" : "w-10 justify-center",
          )}
        >
          {sidebarOpen ? (
            <>
              <span className="text-label">Canvas</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleCreateCanvas}
                  disabled={isCreating}
                  className={cn(
                    "inline-flex h-7 w-7 items-center justify-center rounded text-[var(--overlay-1)] transition-colors",
                    "hover:bg-[var(--surface-wash)] hover:text-[var(--text)]",
                    isCreating && "opacity-60",
                  )}
                  title="New canvas"
                  aria-label="New canvas"
                >
                  {isCreating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FilePlus2 className="h-3.5 w-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => setSidebarOpen(false)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
                  title="Collapse sidebar"
                  aria-label="Collapse sidebar"
                >
                  <PanelLeftClose className="h-3.5 w-3.5" />
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="inline-flex h-7 w-7 items-center justify-center rounded text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
              title="Show sidebar"
              aria-label="Show sidebar"
            >
              <PanelLeftOpen className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {sidebarOpen && (
          <div className="min-h-0 w-[284px] flex-1 overflow-y-auto p-2">
            {loadingCanvases ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-4 w-4 animate-spin text-[var(--accent)]" />
              </div>
            ) : canvases.length === 0 ? (
              <p className="px-2 py-2 text-[11px] text-[var(--overlay-1)]">No canvases yet.</p>
            ) : (
              <div className="space-y-0.5">
                {canvases.map((canvas) => {
                  const isActive = canvas.id === selectedId;
                  return (
                    <div
                      key={canvas.id}
                      className={cn(
                        "group relative flex items-center gap-1 rounded py-1.5 pl-2 pr-1 transition-colors",
                        isActive
                          ? "bg-[var(--accent-soft)]"
                          : "hover:bg-[var(--surface-wash)]",
                      )}
                    >
                      {isActive && (
                        <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-[3px] rounded-l bg-[var(--accent)]" />
                      )}
                      <button
                        type="button"
                        onClick={() => setSelectedId(canvas.id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className={cn("truncate text-[12px]", isActive ? "text-[var(--accent)]" : "text-[var(--subtext-1)]")}>
                          {canvas.name}
                        </div>
                        <div className="mt-0.5 font-mono text-[10px] text-[var(--overlay-1)]">
                          {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(canvas.updated_at))}
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteCanvas(canvas.id)}
                        className="hidden h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--overlay-1)] transition-colors hover:text-[var(--danger)] group-hover:flex"
                        title="Delete canvas"
                        aria-label={`Delete ${canvas.name}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--base)] px-4">
          <div className="flex min-w-0 flex-1 items-center">
            {selectedCanvas ? (
              <input
                value={titleDraft}
                onChange={(event) => setTitleDraft(event.target.value)}
                onBlur={() => void commitRename()}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void commitRename();
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setTitleDraft(selectedCanvas.name);
                    (event.target as HTMLInputElement).blur();
                  }
                }}
                className="min-w-0 flex-1 border-none bg-transparent p-0 text-[13px] text-[var(--subtext-1)] outline-none"
              />
            ) : null}
          </div>
          {loadingCanvas ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--overlay-1)]" />
          ) : currentSummary ? (
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--overlay-1)]">
              {formatSaveStatus(saveStatus)}
            </span>
          ) : null}
        </div>

        <div className="min-h-0 flex-1">
          {selectedCanvas && draftDocument ? (
            <CanvasEditor
              key={selectedCanvas.id}
              initialDocument={draftDocument}
              onChange={handleDocumentChange}
            />
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-sm text-[var(--subtext-0)]">
              Select a canvas or create a new one.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export default CanvasView;
