import "@xyflow/react/dist/style.css";
import "./canvas.css";

import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  ConnectionMode,
  type Edge,
  Handle,
  MarkerType,
  type Node,
  NodeResizer,
  type NodeProps,
  PanOnScrollMode,
  Position,
  ReactFlow,
  SelectionMode,
  type Viewport,
} from "@xyflow/react";
import { type CSSProperties, type MouseEvent as ReactMouseEvent, useEffect, useMemo, useRef, useState } from "react";

import type { CanvasDocumentData, CanvasEdgeData, CanvasLineStyle, CanvasNodeData, CanvasNodeType, CanvasSide } from "@/lib/types";
import {
  alignOptions,
  backgroundOptions,
  borderOptions,
  canInlineEdit,
  canvasEdgeToFlowEdge,
  canvasGridSize,
  canvasNodeToFlowNode,
  compactPathHint,
  createCanvasNode,
  displayGroupTitle,
  displayImageTitle,
  displayTitle,
  edgePresentation,
  fileBasename,
  fileExtension,
  findContainingGroup,
  FlowViewportApi,
  flowNodeToCanvasData,
  flowToCanvasDocument,
  formatFilePreview,
  groupBounds,
  groupContainsNode,
  isCustomColor,
  isPresetColor,
  nextNodePositionInGroup,
  normalizeBorder,
  normalizeColor,
  normalizeHexColor,
  normalizeLineStyle,
  normalizeShape,
  normalizeTextAlign,
  persistCanvasNodeData,
  serializeCanvasDocument,
  shapeOptions,
  colorOptions,
  truncateFilename,
} from "@/components/canvas/CanvasSerializer";

type BottomPanel = "background" | null;
type SelectionPanel = "color" | "shape" | "border" | "align" | null;
type EdgePanel = "color" | null;

interface CanvasNodeViewData extends CanvasNodeData {
  assetUri?: string;
  filePreview?: string;
  draftText?: string;
  draftDetail?: string;
  isEditing?: boolean;
  onStartEdit?: () => void;
  onDraftChange?: (value: string) => void;
  onDraftDetailChange?: (value: string) => void;
  onCommitEdit?: () => void;
  onCancelEdit?: () => void;
}

interface CanvasEditorProps {
  initialDocument: CanvasDocumentData;
  onChange?: (document: CanvasDocumentData) => void;
}

function viewportEquals(left?: Viewport, right?: Viewport): boolean {
  if (!left && !right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return left.x === right.x && left.y === right.y && left.zoom === right.zoom;
}

function canvasMetaEquals(
  left: CanvasDocumentData["sogo"] | undefined,
  right: CanvasDocumentData["sogo"] | undefined,
): boolean {
  if (!left && !right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return (
    left.background === right.background &&
    left.snapToGrid === right.snapToGrid &&
    viewportEquals(left.viewport, right.viewport)
  );
}

function positionEquals(
  left: { left: number; top: number } | null,
  right: { left: number; top: number } | null,
): boolean {
  if (!left && !right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return left.left === right.left && left.top === right.top;
}

function sameAssetUris(
  left: Record<string, string>,
  right: Record<string, string>,
): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  for (const key of leftKeys) {
    if (left[key] !== right[key]) {
      return false;
    }
  }

  return true;
}

function sameStringArray(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) {
      return false;
    }
  }

  return true;
}

function colorToRgb(color: string): [number, number, number] | null {
  const normalized = normalizeHexColor(color);
  if (!normalized) {
    return null;
  }

  return [
    Number.parseInt(normalized.slice(1, 3), 16),
    Number.parseInt(normalized.slice(3, 5), 16),
    Number.parseInt(normalized.slice(5, 7), 16),
  ];
}

function customNodeToneStyle(color: string): CSSProperties {
  const rgb = colorToRgb(color);
  if (!rgb) {
    return {};
  }

  const [red, green, blue] = rgb;
  return {
    "--node-accent": color,
    "--node-fill": `rgba(${red}, ${green}, ${blue}, 0.19)`,
  } as CSSProperties;
}

function colorInputAnchorStyle(position: { left: number; top: number } | null): CSSProperties | undefined {
  if (!position) {
    return undefined;
  }

  return {
    left: position.left + 104,
    top: position.top + 20,
  };
}

function resolveInlineAsset(path?: string): string | undefined {
  if (!path) {
    return undefined;
  }

  if (
    path.startsWith("http://") ||
    path.startsWith("https://") ||
    path.startsWith("data:") ||
    path.startsWith("blob:") ||
    path.startsWith("/")
  ) {
    return path;
  }

  return undefined;
}

function ToolbarIcon({ name }: { name: string }) {
  switch (name) {
    case "text":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4.5" y="6" width="15" height="12" rx="3" />
          <path d="M8 10h8" />
          <path d="M8 14h5.5" />
        </svg>
      );
    case "group":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="5" y="7" width="9" height="9" rx="2" />
          <rect x="10" y="10" width="9" height="9" rx="2" />
        </svg>
      );
    case "file":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8 4.5h6l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 7 19V6A1.5 1.5 0 0 1 8 4.5Z" />
          <path d="M14 4.5V9h4" />
        </svg>
      );
    case "image":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4.5" y="6" width="15" height="12" rx="2" />
          <circle cx="10" cy="10" r="1.5" />
          <path d="M7 16l3.5-3.5L13 15l2.5-2.5L17.5 15" />
        </svg>
      );
    case "background":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="7" cy="7" r="1.25" />
          <circle cx="12" cy="7" r="1.25" />
          <circle cx="17" cy="7" r="1.25" />
          <circle cx="7" cy="12" r="1.25" />
          <circle cx="12" cy="12" r="1.25" />
          <circle cx="17" cy="12" r="1.25" />
          <circle cx="7" cy="17" r="1.25" />
          <circle cx="12" cy="17" r="1.25" />
          <circle cx="17" cy="17" r="1.25" />
        </svg>
      );
    case "delete":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 7h14" />
          <path d="M9 7V5.5h6V7" />
          <path d="M8 9.5v8" />
          <path d="M12 9.5v8" />
          <path d="M16 9.5v8" />
          <path d="M6.5 7l1 11.5a1 1 0 0 0 1 .9h7a1 1 0 0 0 1-.9l1-11.5" />
        </svg>
      );
    case "color":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 5.5a6.5 6.5 0 1 0 0 13c1.2 0 1.9-.6 1.9-1.4 0-.7-.3-1.2-.3-1.8 0-1 1-1.3 1.8-1.3h.8A3.8 3.8 0 0 0 20 10.2 4.7 4.7 0 0 0 15.3 5.5Z" />
          <circle cx="8.5" cy="11" r="1" />
          <circle cx="11.5" cy="8.5" r="1" />
          <circle cx="15" cy="9.5" r="1" />
        </svg>
      );
    case "shape":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 7h10l-2 10H5l2-10Z" />
        </svg>
      );
    case "edit":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 18l3.5-.5L18 9l-3-3-8.5 8.5L6 18Z" />
          <path d="M13.5 7.5l3 3" />
        </svg>
      );
    case "align":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 8h12" />
          <path d="M8 12h8" />
          <path d="M6 16h12" />
        </svg>
      );
    case "border":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="5" y="6" width="14" height="12" rx="2" />
          <path d="M5 10h14" />
        </svg>
      );
    case "line":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12h3" />
          <path d="M10 12h4" />
          <path d="M16 12h3" />
        </svg>
      );
    case "arrow":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12h11" />
          <path d="M13.5 8.5 19 12l-5.5 3.5" />
        </svg>
      );
    default:
      return null;
  }
}

function CanvasNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as unknown as CanvasNodeViewData;
  const isSelected = Boolean(selected);
  const shape = normalizeShape(nodeData.sogo?.shape);
  const border = normalizeBorder(nodeData.sogo?.border);
  const align = normalizeTextAlign(nodeData.sogo?.textAlign);
  const color = normalizeColor(nodeData.color);
  const toneClass = isPresetColor(color) ? `tone-${color}` : "tone-custom";
  const toneStyle = isCustomColor(color) ? customNodeToneStyle(color) : {};
  const fileName = fileBasename(nodeData.file);
  const fileHint = compactPathHint(nodeData.file);
  const fileDisplayName = truncateFilename(nodeData.file, 28);
  const imageDisplayName = truncateFilename(displayImageTitle(nodeData), 24);
  const extension = fileExtension(nodeData.file).toLowerCase();
  const ext = extension.toUpperCase();
  const filePreview = formatFilePreview(nodeData.filePreview, extension);
  const imageBody = nodeData.text?.trim();

  return (
    <div className="canvas-node-shell">
      <NodeResizer
        isVisible={isSelected && !nodeData.isEditing}
        minWidth={nodeData.type === "group" ? 160 : 80}
        minHeight={nodeData.type === "image" ? 120 : nodeData.type === "file" ? 80 : 44}
        lineClassName="node-resizer-line"
        handleClassName="node-resizer-handle"
      />
      <Handle id="top" className="node-handle node-handle-top" type="source" position={Position.Top} isConnectable isConnectableStart isConnectableEnd />
      <Handle id="right" className="node-handle node-handle-right" type="source" position={Position.Right} isConnectable isConnectableStart isConnectableEnd />
      <Handle id="bottom" className="node-handle node-handle-bottom" type="source" position={Position.Bottom} isConnectable isConnectableStart isConnectableEnd />
      <Handle id="left" className="node-handle node-handle-left" type="source" position={Position.Left} isConnectable isConnectableStart isConnectableEnd />
      <div
        className={[
          "canvas-node",
          `node-kind-${nodeData.type}`,
          `shape-${shape}`,
          `border-${border}`,
          `align-${align}`,
          toneClass,
          isSelected ? "is-selected" : "",
          nodeData.isEditing ? "is-editing" : "",
        ].join(" ")}
        style={{
          textAlign: align,
          ...toneStyle,
        }}
      >
        {nodeData.type === "group" ? (
          <div className="group-title-wrap">
            {nodeData.isEditing ? (
              <textarea
                autoFocus
                className="group-title-editor nodrag nopan"
                value={nodeData.draftText ?? ""}
                rows={1}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => nodeData.onDraftChange?.(event.target.value)}
                onBlur={() => nodeData.onCommitEdit?.()}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    nodeData.onCancelEdit?.();
                  }
                  if (event.key === "Enter" && !(event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    nodeData.onCommitEdit?.();
                  }
                }}
              />
            ) : (
              <div
                className="group-title nodrag nopan"
                onMouseDown={(event) => {
                  if (isSelected) {
                    event.stopPropagation();
                  }
                }}
                onPointerDown={(event) => {
                  if (isSelected) {
                    event.stopPropagation();
                  }
                }}
                onClick={() => {
                  if (isSelected) {
                    nodeData.onStartEdit?.();
                  }
                }}
                onDoubleClick={() => nodeData.onStartEdit?.()}
              >
                {displayGroupTitle(nodeData)}
              </div>
            )}
          </div>
        ) : null}

        {nodeData.type === "image" && nodeData.assetUri ? (
          <div className="node-image-preview">
            <img src={nodeData.assetUri} alt={fileName || "Image node"} />
          </div>
        ) : null}

        {nodeData.type === "image" && !nodeData.assetUri ? (
          <div className="node-image-placeholder">{imageDisplayName || "Image"}</div>
        ) : null}

        {nodeData.type === "image" && !nodeData.isEditing ? (
          <div className="node-image-title">{imageDisplayName || "Image reference"}</div>
        ) : null}

        {nodeData.type === "image" && nodeData.isEditing ? (
          <div className="node-image-editor-wrap">
            <input
              autoFocus
              className="node-image-title-editor nodrag nopan"
              value={nodeData.draftText ?? ""}
              placeholder="Image title"
              onMouseDown={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => nodeData.onDraftChange?.(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  nodeData.onCancelEdit?.();
                }
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  nodeData.onCommitEdit?.();
                }
              }}
            />
            <textarea
              className="node-image-body-editor nodrag nopan"
              value={nodeData.draftDetail ?? ""}
              placeholder="Add context, role, notes, or stakeholder details"
              rows={4}
              onMouseDown={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => nodeData.onDraftDetailChange?.(event.target.value)}
              onBlur={() => nodeData.onCommitEdit?.()}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  nodeData.onCancelEdit?.();
                }
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  nodeData.onCommitEdit?.();
                }
              }}
            />
          </div>
        ) : null}

        {nodeData.type === "image" && !nodeData.isEditing && imageBody ? (
          <div className="node-image-body">{imageBody}</div>
        ) : null}

        {nodeData.type === "file" ? (
          <>
            <div className="node-file-header">
              <div className="node-file-chip">{ext || "FILE"}</div>
              <div className="node-file-title">{fileDisplayName || "File reference"}</div>
            </div>
            <div className="node-file-preview">
              {filePreview ?? "Reference to this file or document."}
            </div>
          </>
        ) : null}

        {nodeData.isEditing && nodeData.type === "text" ? (
          <textarea
            autoFocus
            className="node-editor nodrag nopan"
            value={nodeData.draftText ?? ""}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => nodeData.onDraftChange?.(event.target.value)}
            onBlur={() => nodeData.onCommitEdit?.()}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                nodeData.onCancelEdit?.();
              }
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                nodeData.onCommitEdit?.();
              }
            }}
          />
        ) : nodeData.type === "text" ? (
          <div
            className="node-content"
            onDoubleClick={() => {
              if (canInlineEdit(nodeData.type)) {
                nodeData.onStartEdit?.();
              }
            }}
          >
            {displayTitle(nodeData)}
          </div>
        ) : null}

        {fileHint ? <div className="node-meta">{fileHint}</div> : null}
      </div>
    </div>
  );
}

const nodeTypes = {
  canvasNode: CanvasNodeComponent,
};

export function CanvasEditor({ initialDocument, onChange }: CanvasEditorProps) {
  const seedDocument = useMemo(() => serializeCanvasDocument(initialDocument), [initialDocument]);
  const shellRef = useRef<HTMLDivElement>(null);
  const reactFlowRef = useRef<FlowViewportApi | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const latestSerializedDocumentRef = useRef<CanvasDocumentData>(seedDocument);
  const suppressNextAutoSaveRef = useRef(false);
  const pendingViewportInitRef = useRef<Viewport | "fit" | null>(
    seedDocument.sogo?.viewport ?? (seedDocument.nodes.length > 0 ? "fit" : null),
  );
  const suppressViewportSaveRef = useRef(false);
  const isMarqueeSelectingRef = useRef(false);
  const marqueeNodeIdsRef = useRef<string[]>([]);
  const suppressNextPaneClickRef = useRef(false);
  const suppressSelectionChangeRef = useRef(false);
  const groupDragRef = useRef<{
    groupId: string;
    startX: number;
    startY: number;
    memberPositions: Map<string, { x: number; y: number }>;
  } | null>(null);
  const nodeColorInputRef = useRef<HTMLInputElement>(null);
  const edgeColorInputRef = useRef<HTMLInputElement>(null);

  const [flowReady, setFlowReady] = useState(false);
  const [canvasMeta, setCanvasMeta] = useState<CanvasDocumentData["sogo"]>(seedDocument.sogo);
  const [nodes, setNodes] = useState<Node[]>(() => seedDocument.nodes.map(canvasNodeToFlowNode));
  const [edges, setEdges] = useState<Edge[]>(() => seedDocument.edges.map(canvasEdgeToFlowEdge));
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [bottomPanel, setBottomPanel] = useState<BottomPanel>(null);
  const [selectionPanel, setSelectionPanel] = useState<SelectionPanel>(null);
  const [edgePanel, setEdgePanel] = useState<EdgePanel>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");
  const [draftDetail, setDraftDetail] = useState("");
  const [assetUris, setAssetUris] = useState<Record<string, string>>({});
  const [toolbarPosition, setToolbarPosition] = useState<{ left: number; top: number } | null>(null);
  const [edgeToolbarPosition, setEdgeToolbarPosition] = useState<{ left: number; top: number } | null>(null);
  const [addPrompt, setAddPrompt] = useState<"file" | "image" | null>(null);
  const [addPromptDraft, setAddPromptDraft] = useState("");
  const addPromptInputRef = useRef<HTMLInputElement>(null);

  const selectedNode = useMemo(() => {
    const selected = nodes.find((node) => node.id === selectedNodeId);
    return selected ? flowNodeToCanvasData(selected) : null;
  }, [nodes, selectedNodeId]);

  const selectedEdge = useMemo(() => {
    const selected = edges.find((edge) => edge.id === selectedEdgeId);
    const data = selected?.data as { color?: string; lineStyle?: CanvasLineStyle; arrow?: boolean } | undefined;

    if (!selected) {
      return null;
    }

    return {
      id: selected.id,
      color: data?.color ?? "default",
      lineStyle: normalizeLineStyle(data?.lineStyle),
      arrow: data?.arrow ?? true,
    };
  }, [edges, selectedEdgeId]);

  const showSelectionTools = Boolean(selectedNode) && selectedNodeIds.length <= 1;
  const selectedNodeIdSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);

  const renderedEdges = useMemo(
    () =>
      edges.map((edge) => ({
        ...edge,
        selected: edge.id === selectedEdgeId,
      })),
    [edges, selectedEdgeId],
  );

  const renderedNodes = useMemo(
    () =>
      nodes.map((node) => {
        const base = flowNodeToCanvasData(node);
        const viewData: CanvasNodeViewData = {
          ...base,
          assetUri: base.file ? assetUris[base.file] : undefined,
          draftText,
          draftDetail,
          isEditing: editingNodeId === node.id,
          onStartEdit: () => startEditingNode(node.id),
          onDraftChange: setDraftText,
          onDraftDetailChange: setDraftDetail,
          onCommitEdit: commitEdit,
          onCancelEdit: cancelEdit,
        };

        return {
          ...node,
          selected: selectedNodeIdSet.has(node.id) || node.id === selectedNodeId || Boolean(node.selected),
          draggable: editingNodeId === null || editingNodeId !== node.id,
          data: viewData as unknown as Record<string, unknown>,
        };
      }),
    [nodes, assetUris, draftDetail, draftText, editingNodeId, selectedNodeId, selectedNodeIdSet],
  );

  const serializedDocument = useMemo(
    () =>
      serializeCanvasDocument(
        flowToCanvasDocument(nodes, edges, {
          ...latestSerializedDocumentRef.current,
          sogo: canvasMeta,
        }),
      ),
    [canvasMeta, edges, nodes],
  );

  useEffect(() => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }

    if (suppressNextAutoSaveRef.current) {
      suppressNextAutoSaveRef.current = false;
      return;
    }

    saveTimerRef.current = window.setTimeout(() => {
      onChange?.(serializedDocument);
    }, 180);

    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [onChange, serializedDocument]);

  useEffect(() => {
    latestSerializedDocumentRef.current = serializedDocument;
  }, [serializedDocument]);

  useEffect(() => {
    const pending = pendingViewportInitRef.current;
    const instance = reactFlowRef.current;

    if (!instance || pending === null || !flowReady) {
      return;
    }

    pendingViewportInitRef.current = null;
    suppressViewportSaveRef.current = true;

    const applyViewport = async () => {
      if (pending === "fit") {
        await instance.fitView({
          padding: 0.18,
          duration: 0,
          minZoom: 0.45,
          maxZoom: 1.1,
        });
      } else {
        instance.setViewport(pending, { duration: 0 });
      }

      requestAnimationFrame(() => {
        const viewport = instance.getViewport();
        updateCanvasMeta({
          ...canvasMeta,
          viewport,
        });
        suppressViewportSaveRef.current = false;
      });
    };

    void applyViewport();
  }, [canvasMeta, flowReady]);

  useEffect(() => {
    if (!selectedNodeId || !shellRef.current) {
      setToolbarPosition(null);
      return;
    }

    const updatePosition = () => {
      const shellRect = shellRef.current?.getBoundingClientRect();
      const selectedElement = document.querySelector(`.react-flow__node[data-id="${selectedNodeId}"]`) as HTMLElement | null;

      if (!shellRect || !selectedElement) {
        setToolbarPosition((current) => (current === null ? current : null));
        return;
      }

      const rect = selectedElement.getBoundingClientRect();
      const nextPosition = {
        left: rect.left - shellRect.left + rect.width / 2,
        top: rect.top - shellRect.top - 18,
      };
      setToolbarPosition((current) => (positionEquals(current, nextPosition) ? current : nextPosition));
    };

    const frame = requestAnimationFrame(updatePosition);
    window.addEventListener("resize", updatePosition);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", updatePosition);
    };
  }, [editingNodeId, nodes, selectedNodeId]);

  useEffect(() => {
    if (!selectedEdgeId || !shellRef.current) {
      setEdgeToolbarPosition(null);
      return;
    }

    const updatePosition = () => {
      const shellRect = shellRef.current?.getBoundingClientRect();
      const selectedPath = document.querySelector(`.react-flow__edge[data-id="${selectedEdgeId}"] .react-flow__edge-path`) as SVGPathElement | null;

      if (!shellRect || !selectedPath) {
        setEdgeToolbarPosition((current) => (current === null ? current : null));
        return;
      }

      const rect = selectedPath.getBoundingClientRect();
      const nextPosition = {
        left: rect.left - shellRect.left + rect.width / 2,
        top: rect.top - shellRect.top - 8,
      };
      setEdgeToolbarPosition((current) =>
        positionEquals(current, nextPosition) ? current : nextPosition,
      );
    };

    const frame = requestAnimationFrame(updatePosition);
    window.addEventListener("resize", updatePosition);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", updatePosition);
    };
  }, [edges, selectedEdgeId]);

  useEffect(() => {
    const nextAssetUris: Record<string, string> = {};
    for (const node of nodes.map(flowNodeToCanvasData)) {
      if (node.type !== "image" || !node.file) continue;
      const uri = resolveInlineAsset(node.file);
      if (uri) nextAssetUris[node.file] = uri;
    }
    setAssetUris((current) => (sameAssetUris(current, nextAssetUris) ? current : nextAssetUris));
  }, [nodes]);

  useEffect(() => {
    if (selectedNodeId) {
      setSelectionPanel(null);
    }
  }, [selectedNodeId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Delete" || event.key === "Backspace") {
        handleDeleteSelection();
      }

      if (event.key === "Enter" && selectedNode && !editingNodeId) {
        if (canInlineEdit(selectedNode.type)) {
          event.preventDefault();
          startEditingNode(selectedNode.id);
        }
      }

      if (event.key === "Escape" && editingNodeId) {
        event.preventDefault();
        cancelEdit();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editingNodeId, selectedNode]);

  function setSelectedNodeIdSafe(next: string | null): void {
    setSelectedNodeId((current) => (current === next ? current : next));
  }

  function setSelectedEdgeIdSafe(next: string | null): void {
    setSelectedEdgeId((current) => (current === next ? current : next));
  }

  function setSelectedNodeIdsSafe(next: string[]): void {
    setSelectedNodeIds((current) => (sameStringArray(current, next) ? current : next));
  }

  function updateCanvasMeta(next: CanvasDocumentData["sogo"]): void {
    setCanvasMeta((current) => (canvasMetaEquals(current, next) ? current : next));
  }

  function patchNode(nodeId: string, updater: (node: CanvasNodeData) => CanvasNodeData): void {
    setNodes((current) =>
      current.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              data: updater(persistCanvasNodeData(node.data)) as unknown as Record<string, unknown>,
            }
          : node,
      ),
    );
  }

  function updateSelectedNode(updater: (node: CanvasNodeData) => CanvasNodeData): void {
    if (!selectedNodeId) {
      return;
    }

    patchNode(selectedNodeId, updater);
  }

  function updateSelectedEdge(updater: (edge: CanvasEdgeData) => CanvasEdgeData): void {
    if (!selectedEdgeId) {
      return;
    }

    setEdges((current) =>
      current.map((edge) => {
        if (edge.id !== selectedEdgeId) {
          return edge;
        }

        const base: CanvasEdgeData = {
          id: edge.id,
          fromNode: edge.source,
          toNode: edge.target,
          fromSide: typeof edge.sourceHandle === "string" ? (edge.sourceHandle as CanvasSide) : undefined,
          toSide: typeof edge.targetHandle === "string" ? (edge.targetHandle as CanvasSide) : undefined,
          color: (edge.data as { color?: string } | undefined)?.color ?? "default",
          lineStyle: (edge.data as { lineStyle?: CanvasLineStyle } | undefined)?.lineStyle ?? "solid",
          arrow: (edge.data as { arrow?: boolean } | undefined)?.arrow ?? true,
        };

        const next = updater(base);
        const presentation = edgePresentation(next);

        return {
          ...edge,
          style: presentation.style,
          markerEnd: presentation.markerEnd,
          data: {
            color: next.color ?? "default",
            lineStyle: next.lineStyle ?? "solid",
            arrow: next.arrow ?? true,
          },
        };
      }),
    );
  }

  function startEditingNode(nodeId: string): void {
    const node = nodes.find((item) => item.id === nodeId);
    if (!node) {
      return;
    }

    const persisted = persistCanvasNodeData(node.data);
    if (!canInlineEdit(persisted.type)) {
      return;
    }

    setEditingNodeId(nodeId);
    setDraftText(persisted.type === "image" ? displayImageTitle(persisted) : displayTitle(persisted));
    setDraftDetail(persisted.type === "image" ? persisted.text ?? "" : "");
  }

  function commitEdit(): void {
    if (!editingNodeId) {
      return;
    }

    const node = nodes.find((item) => item.id === editingNodeId);
    if (!node) {
      setEditingNodeId(null);
      return;
    }

    const persisted = persistCanvasNodeData(node.data);
    patchNode(editingNodeId, (current) =>
      current.type === "text"
        ? { ...current, text: draftText }
        : current.type === "image"
          ? { ...current, label: draftText, text: draftDetail }
          : { ...current, label: draftText },
    );

    if (selectedNodeId !== persisted.id) {
      setSelectedNodeIdSafe(persisted.id);
    }

    setEditingNodeId(null);
    setDraftText("");
    setDraftDetail("");
  }

  function cancelEdit(): void {
    setEditingNodeId(null);
    setDraftText("");
    setDraftDetail("");
  }

  function addNodeOfType(type: CanvasNodeType, partial?: Partial<CanvasNodeData>) {
    const selectedGroup = selectedNode && selectedNode.type === "group" ? selectedNode : null;
    const groupMembers = selectedGroup
      ? nodes
          .map(flowNodeToCanvasData)
          .filter((node) => node.type !== "group" && groupContainsNode(node, selectedGroup))
      : [];
    const offset = nodes.length * 24;
    const position = selectedGroup
      ? nextNodePositionInGroup(type, selectedGroup, groupMembers)
      : { x: 180 + offset, y: 140 + offset };
    const node = createCanvasNode(type, position, {
      ...partial,
      groupId: selectedGroup?.id,
    });
    setNodes((current) => [...current, canvasNodeToFlowNode(node)]);
    setSelectedNodeIdSafe(node.id);
    setSelectedNodeIdsSafe([node.id]);
    setBottomPanel(null);

    if (canInlineEdit(type)) {
      setEditingNodeId(node.id);
      setDraftText(type === "image" ? displayImageTitle(node) : displayTitle(node));
      setDraftDetail(type === "image" ? node.text ?? "" : "");
    }
  }

  function toggleSelectionPanel(panel: Exclude<SelectionPanel, null>): void {
    setSelectionPanel((current) => (current === panel ? null : panel));
  }

  function openNodeCustomColorPicker(): void {
    nodeColorInputRef.current?.click();
  }

  function openEdgeCustomColorPicker(): void {
    edgeColorInputRef.current?.click();
  }

  function createGroupFromSelection(nodeIds: string[]): void {
    const selected = nodes
      .filter((node) => nodeIds.includes(node.id))
      .map(flowNodeToCanvasData)
      .filter((node) => node.type !== "group");

    if (selected.length < 2) {
      return;
    }

    const bounds = groupBounds(selected);
    const groupNode = createCanvasNode("group", { x: bounds.x, y: bounds.y }, bounds);

    suppressSelectionChangeRef.current = true;
    setNodes((current) => {
      const selectedIdSet = new Set(nodeIds);
      return [
        {
          ...canvasNodeToFlowNode(groupNode),
          selected: true,
        },
        ...current.map((node) => {
          if (!selectedIdSet.has(node.id)) {
            return {
              ...node,
              selected: false,
            };
          }

          const base = persistCanvasNodeData(node.data);
          return {
            ...node,
            selected: false,
            data: {
              ...base,
              groupId: groupNode.id,
            } as unknown as Record<string, unknown>,
          };
        }),
      ];
    });
    setSelectedNodeIdSafe(groupNode.id);
    setSelectedNodeIdsSafe([groupNode.id]);

    requestAnimationFrame(() => {
      suppressSelectionChangeRef.current = false;
    });
  }

  function addFileNode(): void {
    setAddPromptDraft("");
    setAddPrompt("file");
    requestAnimationFrame(() => addPromptInputRef.current?.focus());
  }

  function addImageNode(): void {
    setAddPromptDraft("");
    setAddPrompt("image");
    requestAnimationFrame(() => addPromptInputRef.current?.focus());
  }

  function commitAddPrompt(): void {
    const value = addPromptDraft.trim();
    if (value && addPrompt === "file") {
      addNodeOfType("file", { file: value, label: fileBasename(value) });
    } else if (value && addPrompt === "image") {
      addNodeOfType("image", { file: value, label: fileBasename(value) });
    }
    setAddPrompt(null);
    setAddPromptDraft("");
  }

  function dismissAddPrompt(): void {
    setAddPrompt(null);
    setAddPromptDraft("");
  }

  function handlePaneDoubleClick(): void {
    addNodeOfType("text");
  }

  function handleConnect(connection: Connection): void {
    if (!connection.source || !connection.target) {
      return;
    }

    const edgeData: CanvasEdgeData = {
      id: crypto.randomUUID(),
      fromNode: connection.source,
      toNode: connection.target,
      fromSide: typeof connection.sourceHandle === "string" ? (connection.sourceHandle as CanvasSide) : undefined,
      toSide: typeof connection.targetHandle === "string" ? (connection.targetHandle as CanvasSide) : undefined,
      color: "default",
      lineStyle: "solid",
      arrow: true,
    };
    const presentation = edgePresentation(edgeData);

    setEdges((current) =>
      addEdge(
        {
          ...connection,
          id: edgeData.id,
          sourceHandle: edgeData.fromSide,
          targetHandle: edgeData.toSide,
          data: {
            color: edgeData.color,
            lineStyle: edgeData.lineStyle,
            arrow: edgeData.arrow,
          },
          type: "bezier",
          style: presentation.style,
          markerEnd: presentation.markerEnd,
        },
        current,
      ),
    );
  }

  function handleDeleteSelection(): void {
    if (selectedEdgeId) {
      setEdges((current) => current.filter((edge) => edge.id !== selectedEdgeId));
      setSelectedEdgeIdSafe(null);
      return;
    }

    if (!selectedNodeId || editingNodeId) {
      return;
    }

    setNodes((current) =>
      current
        .filter((node) => node.id !== selectedNodeId)
        .map((node) => {
          const base = persistCanvasNodeData(node.data);
          if (base.groupId !== selectedNodeId) {
            return node;
          }

          return {
            ...node,
            data: {
              ...base,
              groupId: undefined,
            } as unknown as Record<string, unknown>,
          };
        }),
    );
    setEdges((current) => current.filter((edge) => edge.source !== selectedNodeId && edge.target !== selectedNodeId));
    setSelectedNodeIdSafe(null);
    setSelectedNodeIdsSafe([]);
  }

  function handleNodeDragStart(_: ReactMouseEvent, node: Node): void {
    const persisted = flowNodeToCanvasData(node);
    if (persisted.type !== "group") {
      groupDragRef.current = null;
      return;
    }

    const members = nodes
      .map(flowNodeToCanvasData)
      .filter((item) => item.id !== persisted.id && item.type !== "group" && groupContainsNode(item, persisted));

    groupDragRef.current = {
      groupId: persisted.id,
      startX: node.position.x,
      startY: node.position.y,
      memberPositions: new Map(members.map((item) => [item.id, { x: item.x, y: item.y }])),
    };
  }

  function handleNodeDrag(_: ReactMouseEvent, node: Node): void {
    const dragState = groupDragRef.current;
    if (!dragState || dragState.groupId !== node.id) {
      return;
    }

    const deltaX = node.position.x - dragState.startX;
    const deltaY = node.position.y - dragState.startY;

    setNodes((current) =>
      current.map((item) => {
        if (item.id === node.id) {
          return {
            ...item,
            position: node.position,
          };
        }

        const start = dragState.memberPositions.get(item.id);
        if (!start) {
          return item;
        }

        return {
          ...item,
          position: {
            x: start.x + deltaX,
            y: start.y + deltaY,
          },
        };
      }),
    );
  }

  function handleNodeDragStop(_: ReactMouseEvent, node: Node): void {
    const moved = flowNodeToCanvasData(node);

    if (moved.type !== "group") {
      setNodes((current) => {
        const next = current.map((item) => (item.id === node.id ? { ...item, position: node.position } : item));
        const canvasNodes = next.map(flowNodeToCanvasData);
        const nextGroup = findContainingGroup(moved, canvasNodes);

        return next.map((item) => {
          if (item.id !== node.id) {
            return item;
          }

          const base = persistCanvasNodeData(item.data);
          return {
            ...item,
            data: {
              ...base,
              groupId: nextGroup?.id,
            } as unknown as Record<string, unknown>,
          };
        });
      });
    }

    groupDragRef.current = null;
  }

  return (
    <div
      ref={shellRef}
      className={`intelizen-canvas background-${canvasMeta?.background ?? "dots"}`}
    >
      <ReactFlow
        nodes={renderedNodes}
        edges={renderedEdges}
        onInit={(instance) => {
          reactFlowRef.current = instance as unknown as FlowViewportApi;
          setFlowReady(true);
        }}
        nodeTypes={nodeTypes}
        proOptions={{ hideAttribution: true }}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        minZoom={0.2}
        maxZoom={2.5}
        connectionMode={ConnectionMode.Loose}
        snapToGrid={canvasMeta?.snapToGrid ?? false}
        snapGrid={[canvasGridSize, canvasGridSize]}
        selectionOnDrag
        selectionKeyCode={null}
        selectionMode={SelectionMode.Partial}
        selectNodesOnDrag={false}
        panOnDrag={false}
        panOnScroll
        panOnScrollMode={PanOnScrollMode.Free}
        nodesDraggable={editingNodeId === null}
        nodesConnectable
        elementsSelectable
        defaultEdgeOptions={{
          type: "bezier",
          style: {
            stroke: "var(--canvas-edge)",
            strokeWidth: 2,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: "var(--canvas-edge)",
          },
        }}
        connectionLineStyle={{
          stroke: "var(--canvas-accent)",
          strokeWidth: 2.5,
        }}
        onDoubleClick={(event) => {
          const target = event.target as HTMLElement;
          if (target.closest(".react-flow__node")) {
            return;
          }
          handlePaneDoubleClick();
        }}
        onPaneClick={() => {
          if (suppressNextPaneClickRef.current) {
            suppressNextPaneClickRef.current = false;
            return;
          }

          if (editingNodeId) {
            commitEdit();
          }
          setSelectedNodeIdSafe(null);
          setSelectedNodeIdsSafe([]);
          setSelectedEdgeIdSafe(null);
          setSelectionPanel(null);
          setEdgePanel(null);
          setBottomPanel(null);
        }}
        onNodeClick={(_, node) => {
          setSelectedNodeIdSafe(node.id);
          setSelectedNodeIdsSafe([node.id]);
          setSelectedEdgeIdSafe(null);
          setEdgePanel(null);
        }}
        onEdgeClick={(_, edge) => {
          setSelectedEdgeIdSafe(edge.id);
          setSelectedNodeIdSafe(null);
          setSelectedNodeIdsSafe([]);
          setSelectionPanel(null);
          setEdgePanel(null);
        }}
        onNodeDoubleClick={(_, node) => {
          const persisted = persistCanvasNodeData(node.data);
          if (canInlineEdit(persisted.type)) {
            startEditingNode(node.id);
          }
        }}
        onNodeDragStart={handleNodeDragStart}
        onNodeDrag={handleNodeDrag}
        onNodeDragStop={handleNodeDragStop}
        onNodesChange={(changes) => {
          if (changes.every((change) => change.type === "dimensions" || change.type === "select")) {
            suppressNextAutoSaveRef.current = true;
          }
          setNodes((current) => applyNodeChanges(changes, current));
        }}
        onEdgesChange={(changes) => setEdges((current) => applyEdgeChanges(changes, current))}
        onConnect={handleConnect}
        onMoveEnd={(_, viewport) => {
          if (suppressViewportSaveRef.current) {
            return;
          }

          updateCanvasMeta({
            ...canvasMeta,
            viewport,
          });
        }}
        onSelectionStart={() => {
          isMarqueeSelectingRef.current = true;
          marqueeNodeIdsRef.current = [];
          setSelectedNodeIdSafe(null);
          setSelectedEdgeIdSafe(null);
          setSelectionPanel(null);
          setEdgePanel(null);
        }}
        onSelectionChange={({ nodes: nextSelectedNodes }) => {
          if (suppressSelectionChangeRef.current) {
            return;
          }

          const ids = nextSelectedNodes.map((node) => node.id);
          if (isMarqueeSelectingRef.current) {
            marqueeNodeIdsRef.current = ids;
          }
          setSelectedNodeIdsSafe(ids);
          if (ids.length <= 1) {
            setSelectedNodeIdSafe(ids[0] ?? null);
          } else {
            setSelectedNodeIdSafe(null);
          }
        }}
        onSelectionEnd={() => {
          if (!isMarqueeSelectingRef.current) {
            return;
          }

          isMarqueeSelectingRef.current = false;
          const ids = marqueeNodeIdsRef.current;
          marqueeNodeIdsRef.current = [];

          if (ids.length > 1) {
            suppressNextPaneClickRef.current = true;
            createGroupFromSelection(ids);
          }
        }}
      />

      {showSelectionTools && toolbarPosition ? (
        <div className="contextual-toolbar-stack" style={{ left: toolbarPosition.left, top: toolbarPosition.top }}>
          <div className="contextual-toolbar">
            <div className="toolbar-group">
              <button title="Delete" aria-label="Delete" className="toolbar-command" onClick={handleDeleteSelection}>
                <ToolbarIcon name="delete" />
              </button>
              <button
                title="Color"
                aria-label="Color"
                className={["toolbar-command", selectionPanel === "color" ? "is-active" : ""].join(" ")}
                onClick={() => toggleSelectionPanel("color")}
              >
                <ToolbarIcon name="color" />
              </button>
              <button
                title="Border"
                aria-label="Border"
                className={["toolbar-command", selectionPanel === "border" ? "is-active" : ""].join(" ")}
                onClick={() => toggleSelectionPanel("border")}
              >
                <ToolbarIcon name="line" />
              </button>
              <button
                title="Align"
                aria-label="Align"
                className={["toolbar-command", selectionPanel === "align" ? "is-active" : ""].join(" ")}
                onClick={() => toggleSelectionPanel("align")}
              >
                <ToolbarIcon name="align" />
              </button>
              <button
                title="Shape"
                aria-label="Shape"
                className={["toolbar-command", selectionPanel === "shape" ? "is-active" : ""].join(" ")}
                onClick={() => toggleSelectionPanel("shape")}
              >
                <ToolbarIcon name="shape" />
              </button>
              {selectedNode && canInlineEdit(selectedNode.type) ? (
                <button
                  title="Edit content"
                  aria-label="Edit content"
                  className="toolbar-command"
                  onClick={() => startEditingNode(selectedNode.id)}
                >
                  <ToolbarIcon name="edit" />
                </button>
              ) : null}
            </div>
          </div>

          {selectedNode && selectionPanel ? (
            <div className="contextual-tray">
              {selectionPanel === "color" ? (
                <div className="toolbar-group">
                  {colorOptions.map((color) => (
                    <button
                      key={color}
                      className={[
                        "swatch-button",
                        color === "rainbow"
                          ? normalizeColor(selectedNode.color) === "rainbow" || isCustomColor(normalizeColor(selectedNode.color))
                            ? "is-active"
                            : ""
                          : normalizeColor(selectedNode.color) === color
                            ? "is-active"
                            : "",
                      ].join(" ")}
                      onClick={() =>
                        color === "rainbow"
                          ? openNodeCustomColorPicker()
                          : updateSelectedNode((node) => ({ ...node, color }))
                      }
                      title={color === "rainbow" ? "Custom color" : color}
                    >
                      <span className={`color-swatch color-swatch-${color}`} />
                    </button>
                  ))}
                </div>
              ) : null}

              {selectionPanel === "shape" ? (
                <div className="toolbar-group">
                  {shapeOptions.map((shape) => (
                    <button
                      key={shape}
                      className={["shape-button", normalizeShape(selectedNode.sogo?.shape) === shape ? "is-active" : ""].join(" ")}
                      onClick={() =>
                        updateSelectedNode((node) => ({
                          ...node,
                          width:
                            shape === "circle" || shape === "diamond"
                              ? Math.max(80, Math.min(node.width, node.height))
                              : node.width,
                          height:
                            shape === "circle" || shape === "diamond"
                              ? Math.max(80, Math.min(node.width, node.height))
                              : node.height,
                          sogo: {
                            ...node.sogo,
                            shape,
                          },
                        }))
                      }
                      title={shape}
                    >
                      <span className={`shape-preview shape-preview-${shape}`} />
                    </button>
                  ))}
                </div>
              ) : null}

              {selectionPanel === "border" ? (
                <div className="toolbar-group">
                  {borderOptions.map((border) => (
                    <button
                      key={border}
                      className={[
                        "tray-button",
                        "tray-button-compact",
                        (selectedNode.sogo?.border ?? "subtle") === border ? "is-active" : "",
                      ].join(" ")}
                      onClick={() =>
                        updateSelectedNode((node) => ({
                          ...node,
                          sogo: {
                            ...node.sogo,
                            border,
                          },
                        }))
                      }
                      title={border}
                    >
                      {border}
                    </button>
                  ))}
                </div>
              ) : null}

              {selectionPanel === "align" ? (
                <div className="toolbar-group">
                  {alignOptions.map((align) => (
                    <button
                      key={align}
                      className={["align-button", (selectedNode.sogo?.textAlign ?? "left") === align ? "is-active" : ""].join(" ")}
                      onClick={() =>
                        updateSelectedNode((node) => ({
                          ...node,
                          sogo: {
                            ...node.sogo,
                            textAlign: align,
                          },
                        }))
                      }
                      title={align}
                    >
                      <span className={`align-preview align-preview-${align}`}>
                        <span />
                        <span />
                        <span />
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {selectedEdge && edgeToolbarPosition ? (
        <div className="contextual-toolbar-stack edge-toolbar-stack" style={{ left: edgeToolbarPosition.left, top: edgeToolbarPosition.top }}>
          <div className="contextual-toolbar">
            <div className="toolbar-group">
              <button title="Delete connector" aria-label="Delete connector" className="toolbar-command" onClick={handleDeleteSelection}>
                <ToolbarIcon name="delete" />
              </button>
              <button
                title="Color"
                aria-label="Color"
                className={["toolbar-command", edgePanel === "color" ? "is-active" : ""].join(" ")}
                onClick={() => setEdgePanel((current) => (current === "color" ? null : "color"))}
              >
                <ToolbarIcon name="color" />
              </button>
              <button
                title="Toggle dashed line"
                aria-label="Toggle dashed line"
                className={["toolbar-command", selectedEdge.lineStyle === "dashed" ? "is-active" : ""].join(" ")}
                onClick={() =>
                  updateSelectedEdge((edge) => ({
                    ...edge,
                    lineStyle: edge.lineStyle === "dashed" ? "solid" : "dashed",
                  }))
                }
              >
                <ToolbarIcon name="border" />
              </button>
              <button
                title="Toggle arrowhead"
                aria-label="Toggle arrowhead"
                className={["toolbar-command", selectedEdge.arrow ? "is-active" : ""].join(" ")}
                onClick={() =>
                  updateSelectedEdge((edge) => ({
                    ...edge,
                    arrow: !edge.arrow,
                  }))
                }
              >
                <ToolbarIcon name="arrow" />
              </button>
            </div>
          </div>

          {edgePanel === "color" ? (
            <div className="contextual-tray">
              <div className="toolbar-group">
                {colorOptions.map((color) => (
                  <button
                    key={color}
                    className={[
                      "swatch-button",
                      color === "rainbow"
                        ? normalizeColor(selectedEdge.color) === "rainbow" || isCustomColor(normalizeColor(selectedEdge.color))
                          ? "is-active"
                          : ""
                        : normalizeColor(selectedEdge.color) === color
                          ? "is-active"
                          : "",
                    ].join(" ")}
                    onClick={() =>
                      color === "rainbow"
                        ? openEdgeCustomColorPicker()
                        : updateSelectedEdge((edge) => ({ ...edge, color }))
                    }
                    title={color === "rainbow" ? "Custom color" : color}
                  >
                    <span className={`color-swatch color-swatch-${color}`} />
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <input
        ref={nodeColorInputRef}
        type="color"
        className="native-color-input"
        style={colorInputAnchorStyle(toolbarPosition)}
        tabIndex={-1}
        aria-hidden="true"
        value={isCustomColor(selectedNode?.color) ? String(normalizeColor(selectedNode?.color)) : "#5b8cff"}
        onChange={(event) => updateSelectedNode((node) => ({ ...node, color: event.target.value }))}
      />

      <input
        ref={edgeColorInputRef}
        type="color"
        className="native-color-input"
        style={colorInputAnchorStyle(edgeToolbarPosition)}
        tabIndex={-1}
        aria-hidden="true"
        value={isCustomColor(selectedEdge?.color) ? String(normalizeColor(selectedEdge?.color)) : "#5b8cff"}
        onChange={(event) => updateSelectedEdge((edge) => ({ ...edge, color: event.target.value }))}
      />

      <div className="toolbar-stack">
        {addPrompt ? (
          <div className="toolbar-tray">
            <input
              ref={addPromptInputRef}
              className="canvas-prompt-input"
              value={addPromptDraft}
              placeholder={addPrompt === "file" ? "File path or label" : "Image URL or path"}
              onChange={(e) => setAddPromptDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); commitAddPrompt(); }
                if (e.key === "Escape") { e.preventDefault(); dismissAddPrompt(); }
              }}
            />
            <div className="toolbar-divider" />
            <button
              className="tray-button tray-button-compact is-active"
              onClick={commitAddPrompt}
              title="Add"
            >
              Add
            </button>
            <button
              className="tray-button tray-button-compact"
              onClick={dismissAddPrompt}
              title="Cancel"
            >
              Cancel
            </button>
          </div>
        ) : null}

        {bottomPanel === "background" ? (
          <div className="toolbar-tray">
            <div className="toolbar-group">
              {backgroundOptions.map((mode) => (
                <button
                  key={mode}
                  className={[
                    "tray-button",
                    "tray-button-compact",
                    canvasMeta?.background === mode ? "is-active" : "",
                  ].join(" ")}
                  onClick={() =>
                    updateCanvasMeta({
                      ...canvasMeta,
                      background: mode,
                    })
                  }
                  title={`Canvas background: ${mode}`}
                >
                  <span className={`background-chip background-chip-${mode}`} />
                  <span>{mode}</span>
                </button>
              ))}
              <button
                className={[
                  "tray-button",
                  "tray-button-compact",
                  canvasMeta?.snapToGrid ? "is-active" : "",
                ].join(" ")}
                onClick={() =>
                  updateCanvasMeta({
                    ...canvasMeta,
                    snapToGrid: !(canvasMeta?.snapToGrid ?? false),
                  })
                }
                title="Snap to grid"
                aria-label="Snap to grid"
              >
                <span className="snap-chip" aria-hidden="true" />
                <span>snap</span>
              </button>
            </div>
          </div>
        ) : null}

        <div className="bottom-toolbar">
          <div className="toolbar-group">
            <button title="Add card" aria-label="Add card" className="insert-button" onClick={() => addNodeOfType("text")}>
              <ToolbarIcon name="text" />
            </button>
            <button title="Add group" aria-label="Add group" className="insert-button" onClick={() => addNodeOfType("group")}>
              <ToolbarIcon name="group" />
            </button>
            <button title="Add file" aria-label="Add file reference" className="insert-button" onClick={addFileNode}>
              <ToolbarIcon name="file" />
            </button>
            <button title="Add image" aria-label="Add image reference" className="insert-button" onClick={addImageNode}>
              <ToolbarIcon name="image" />
            </button>
          </div>
          <div className="toolbar-divider" />
          <button
            title="Edit canvas background"
            aria-label="Edit canvas background"
            className={["toolbar-command", bottomPanel === "background" ? "is-active" : ""].join(" ")}
            onClick={() => setBottomPanel((current) => (current === "background" ? null : "background"))}
          >
            <ToolbarIcon name="background" />
          </button>
        </div>
      </div>
    </div>
  );
}
