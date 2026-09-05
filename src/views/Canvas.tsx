import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FilePlus2, Trash2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { CanvasEditor } from "@/components/canvas/CanvasEditor";
import { createEmptyCanvasDocument, serializeCanvasDocument } from "@/components/canvas/CanvasSerializer";
import { CollapsedRailTrigger } from "@/components/layout/collapsed-rail-trigger";
import { CollapsibleRail } from "@/components/layout/collapsible-rail";
import { Control } from "@/components/ui/control";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryState } from "@/components/ui/query-state";
import {
  createCanvasDocument,
  deleteCanvasDocument,
  getCanvasDocument,
  listCanvasDocuments,
  updateCanvasDocument,
  updateCanvasDocumentContent,
} from "@/lib/data";
import { toast, toastError } from "@/lib/toast";
import { CANVAS_DRAFT_PREFIX, canvasSaveSessions, canvasSaveText, getCanvasSaveSession } from "@/lib/canvas-save-session";
import type { DocumentSaveSession } from "@/lib/document-save-session";
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

function canvasDocumentFingerprint(document: CanvasDocumentData) {
  const normalized = serializeCanvasDocument(document);
  return JSON.stringify(stableCanvasValue({
    nodes: normalized.nodes.map((node) => ({
      ...node,
      x: roundCanvasNumber(node.x),
      y: roundCanvasNumber(node.y),
      width: roundCanvasNumber(node.width),
      height: roundCanvasNumber(node.height),
    })),
    edges: normalized.edges,
    sogo: {
      background: normalized.sogo?.background ?? "dots",
      snapToGrid: normalized.sogo?.snapToGrid ?? false,
    },
  }));
}

function roundCanvasNumber(value: number) {
  return Math.round(value * 100) / 100;
}

function stableCanvasValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableCanvasValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entryValue]) => entryValue !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, stableCanvasValue(entryValue)]),
    );
  }

  return value;
}

export function CanvasView() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedCanvas = searchParams.get("canvas");
  const requestedId = requestedCanvas && /^\d+$/.test(requestedCanvas) && Number.isSafeInteger(Number(requestedCanvas)) && Number(requestedCanvas) > 0
    ? Number(requestedCanvas)
    : null;
  const selectedIdRef = useRef<number | null>(requestedId);
  const loadedCanvasIdRef = useRef<number | null>(null);
  const draftCanvasIdRef = useRef<number | null>(null);
  const draftFingerprintRef = useRef<string | null>(null);
  const saveSessionRef = useRef<DocumentSaveSession | null>(null);
  const lastPersistedTitleRef = useRef<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(requestedId);
  const [draftCanvasId, setDraftCanvasId] = useState<number | null>(null);
  const [draftDocument, setDraftDocument] = useState<CanvasDocumentData | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const canvasesQuery = useQuery({
    queryKey: ["canvas-documents"],
    queryFn: listCanvasDocuments,
  });
  const canvases = useMemo(() => canvasesQuery.data ?? [], [canvasesQuery.data]);

  function resetLoadedDraft() {
    loadedCanvasIdRef.current = null;
    draftCanvasIdRef.current = null;
    draftFingerprintRef.current = null;
    saveSessionRef.current = null;
    lastPersistedTitleRef.current = null;
    setDraftCanvasId(null);
    setDraftDocument(null);
    setTitleDraft("");
    setSaveStatus("idle");
    setSaveError(null);
  }

  function selectCanvas(canvasId: number | null, replace = false) {
    const next = new URLSearchParams(searchParams);
    if (canvasId == null) next.delete("canvas");
    else next.set("canvas", String(canvasId));
    setSearchParams(next, { replace });
  }

  useEffect(() => {
    // An explicit identity is fetched directly, even outside the loaded list.
    // Missing or invalid requests must never display an unrelated canvas.
    if (requestedCanvas !== null) {
      if (selectedIdRef.current !== requestedId) {
        selectedIdRef.current = requestedId;
        resetLoadedDraft();
        setSelectedId(requestedId);
      }
      return;
    }
    if (!canvasesQuery.isSuccess) return;
    if (canvases.length > 0) {
      const next = new URLSearchParams(searchParams);
      next.set("canvas", String(canvases[0].id));
      setSearchParams(next, { replace: true });
    } else if (selectedIdRef.current !== null) {
      selectedIdRef.current = null;
      resetLoadedDraft();
      setSelectedId(null);
    }
  }, [canvases, canvasesQuery.isSuccess, requestedCanvas, requestedId, searchParams, setSearchParams]);

  const canvasQuery = useQuery({
    queryKey: ["canvas-document", selectedId],
    queryFn: () => getCanvasDocument(selectedId as number),
    enabled: selectedId != null,
  });
  const selectedCanvas = canvasQuery.data;
  const loadingCanvas = selectedId != null && canvasQuery.isPending;

  useEffect(() => {
    if (!selectedId || !selectedCanvas || selectedCanvas.id !== selectedId) return;
    const nextDocument = selectedCanvas.content_json ?? createEmptyCanvasDocument();
    const previousPersistedTitle = lastPersistedTitleRef.current;
    const isNewSelection = loadedCanvasIdRef.current !== selectedCanvas.id;
    loadedCanvasIdRef.current = selectedCanvas.id;
    draftCanvasIdRef.current = selectedCanvas.id;
    lastPersistedTitleRef.current = selectedCanvas.name;
    setDraftCanvasId(selectedCanvas.id);

    const session = getCanvasSaveSession(selectedCanvas.id, nextDocument, async (document) => {
      const updated = await updateCanvasDocumentContent(selectedCanvas.id, document);
      queryClient.setQueryData(["canvas-document", selectedCanvas.id], updated);
      queryClient.setQueryData(["canvas-documents"], (prev: CanvasDocumentSummary[] | undefined) =>
        prev?.map((item) => item.id === updated.id ? { ...item, updated_at: updated.updated_at, name: updated.name } : item),
      );
    });
    saveSessionRef.current = session;
    // Never replace local edits with a refresh; the shared writer only adopts
    // server content while clean, after the initial refetch has settled.
    if (!canvasQuery.isFetching) session.adopt(canvasSaveText(nextDocument));
    const syncDraft = () => {
      const snapshot = session.getSnapshot();
      const document = JSON.parse(snapshot.text) as CanvasDocumentData;
      draftFingerprintRef.current = canvasDocumentFingerprint(document);
      setDraftDocument(document);
      setSaveStatus(snapshot.status === "saved" ? "idle" : snapshot.status);
      setSaveError(snapshot.error);
    };
    syncDraft();
    const unsubscribe = session.subscribe(syncDraft);
    setTitleDraft((current) => isNewSelection || current === previousPersistedTitle || current.trim() === selectedCanvas.name ? selectedCanvas.name : current);
    return unsubscribe;
  }, [selectedCanvas, selectedId, canvasQuery.isFetching, queryClient]);

  // Route switches and component unmounts flush the captured canvas rather
  // than cancelling its debounce. Further edits queue behind an active write.
  useEffect(() => {
    const canvasId = selectedId;
    return () => { if (canvasId != null) void canvasSaveSessions.get(canvasId)?.flush(); };
  }, [selectedId]);

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
      selectCanvas(created.id);
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
      lastPersistedTitleRef.current = updated.name;
      setTitleDraft(updated.name);
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
      // Settle its writer before deleting so an older pending request cannot
      // race the deletion or recreate a stale cache entry afterwards.
      await canvasSaveSessions.get(canvasId)?.flush();
      await deleteCanvasDocument(canvasId);
      canvasSaveSessions.delete(canvasId);
      try { window.localStorage.removeItem(`${CANVAS_DRAFT_PREFIX}${canvasId}`); } catch { /* session cleanup remains effective */ }
      queryClient.setQueryData(["canvas-documents"], (prev: CanvasDocumentSummary[] | undefined) =>
        prev?.filter((item) => item.id !== canvasId) ?? prev,
      );
      queryClient.removeQueries({ queryKey: ["canvas-document", canvasId] });
      if (selectedId === canvasId) {
        const next = canvases.find((item) => item.id !== canvasId);
        if (next) {
          selectCanvas(next.id);
        } else {
          selectCanvas(null);
        }
      }
      toast.success("Canvas deleted");
    } catch (error) {
      toastError("Delete failed", error);
    } finally {
      setIsDeleting(false);
    }
  }

  const handleDocumentChange = useCallback((next: CanvasDocumentData) => {
    if (
      !selectedIdRef.current ||
      draftCanvasIdRef.current !== selectedIdRef.current ||
      loadedCanvasIdRef.current !== selectedIdRef.current
    ) {
      return;
    }

    const nextFingerprint = canvasDocumentFingerprint(next);
    if (nextFingerprint === draftFingerprintRef.current) {
      return;
    }

    draftFingerprintRef.current = nextFingerprint;
    saveSessionRef.current?.edit(canvasSaveText(next));
  }, []);

  return (
    <div className="flex h-full min-h-0 bg-[var(--base)]">
      <CollapsibleRail
        title="Canvas"
        width={264}
        collapsed={!sidebarOpen}
        onCollapse={() => setSidebarOpen(false)}
        collapseLabel="Collapse canvas sidebar"
        bodyClassName="w-[264px]"
        actions={(
          <Control
            type="button"
            onClick={handleCreateCanvas}
            loading={isCreating}
            variant="quiet"
            size="icon"
            title="New canvas"
            aria-label="New canvas"
          >
            {!isCreating ? <FilePlus2 className="h-3.5 w-3.5" /> : null}
          </Control>
        )}
      >
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {canvasesQuery.error ? <QueryState isLoading={false} isEmpty={false} error={canvasesQuery.error} errorTitle="Canvas list unavailable" onRetry={() => void canvasesQuery.refetch()} className="px-2">{null}</QueryState> : null}
            {canvasesQuery.isPending ? (
              <div><span className="sr-only">Loading canvases</span><Skeleton lines={4} className="p-2" /></div>
            ) : canvases.length === 0 && !canvasesQuery.error ? (
              <p className="px-2 py-2 text-[var(--t-section)] text-[var(--overlay-1)]">No canvases yet.</p>
            ) : (
              <div className="space-y-0.5">
                {canvases.map((canvas) => {
                  const isActive = canvas.id === selectedId;
                  return (
                    <div
                      key={canvas.id}
                      className={cn(
                        "group relative flex min-h-[var(--h-row)] items-center gap-1 rounded-[var(--r-ctl)] pl-2 pr-1 transition-colors",
                        isActive
                          ? "bg-[var(--selected)] hover:bg-[var(--selected-hover)]"
                          : "hover:bg-[var(--surface-wash)]",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => selectCanvas(canvas.id)}
                        aria-current={isActive ? "page" : undefined}
                        className="flex min-h-[var(--h-row)] min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        <span className={cn("min-w-0 flex-1 truncate text-[var(--t-meta)]", isActive ? "font-medium text-[var(--text)]" : "text-[var(--subtext-1)]")}>
                          {canvas.name}
                        </span>
                        <span className="shrink-0 font-mono text-[var(--t-count)] text-[var(--text-muted)]">
                          {Number.isNaN(Date.parse(canvas.updated_at)) ? "" : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(canvas.updated_at))}
                        </span>
                        {isActive ? <span aria-hidden>›</span> : null}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteCanvas(canvas.id)}
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[var(--r-ctl)] text-[var(--overlay-1)] opacity-0 transition-opacity hover:text-[var(--danger)] group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
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
      </CollapsibleRail>

      <section className="relative flex min-w-0 flex-1 flex-col">
        <CollapsedRailTrigger
          visible={!sidebarOpen}
          onExpand={() => setSidebarOpen(true)}
          label="Expand canvas sidebar"
        />

        <div className="flex h-14 shrink-0 items-center justify-between gap-3 bg-[var(--base)] px-4">
          <div className={cn("flex min-w-0 flex-1 items-center", !sidebarOpen && "pl-11")}>
            {selectedCanvas ? (
              <input
                aria-label="Canvas title"
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
                className="min-w-0 flex-1 border-none bg-transparent p-0 text-[var(--t-ui)] text-[var(--subtext-1)] outline-none"
              />
            ) : null}
          </div>
          {loadingCanvas ? (
            <Skeleton lines={1} className="w-20" />
          ) : selectedCanvas && draftDocument ? (
            <span className="font-mono text-[var(--t-count)] uppercase tracking-[0.14em] text-[var(--overlay-1)]">
              {formatSaveStatus(saveStatus)}
            </span>
          ) : null}
        </div>

        {saveError ? <div role="alert" className="flex shrink-0 items-center gap-3 px-4 py-2 text-[var(--t-meta)] text-[var(--bad)]"><span>Canvas save failed. Your draft is retained. {saveError}</span><Control size="sm" onClick={() => void saveSessionRef.current?.flush()}>Retry save</Control></div> : null}
        {canvasQuery.error && selectedCanvas ? <QueryState isLoading={false} isEmpty={false} error={canvasQuery.error} errorTitle="Canvas refresh failed" onRetry={() => void canvasQuery.refetch()} className="px-4">{null}</QueryState> : null}
        <div className="min-h-0 flex-1">
          {selectedCanvas && selectedCanvas.id === selectedId && draftCanvasId === selectedId && draftDocument ? (
            <CanvasEditor
              key={selectedCanvas.id}
              initialDocument={draftDocument}
              onChange={handleDocumentChange}
            />
          ) : (
            <QueryState
              isLoading={loadingCanvas || (requestedCanvas === null && canvasesQuery.isPending)}
              error={canvasQuery.error || (requestedCanvas === null ? canvasesQuery.error : null)}
              errorTitle="Canvas unavailable"
              onRetry={() => void (selectedId != null ? canvasQuery.refetch() : canvasesQuery.refetch())}
              isEmpty
              loadingLabel="Loading canvas"
              emptyTitle={requestedCanvas !== null ? "Canvas unavailable" : "Select a canvas"}
              emptyDescription={requestedCanvas !== null ? "This canvas could not be found. Choose another canvas from the list." : "Choose a canvas from the list or create a new one."}
              className="px-6 py-8"
            >{null}</QueryState>
          )}
        </div>
      </section>
    </div>
  );
}
