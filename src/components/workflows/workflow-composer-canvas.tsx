import "@xyflow/react/dist/style.css";
import "./workflow-topology.css";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { applyNodeChanges, Background, Controls, Handle, MarkerType, Position, ReactFlow, type Connection, type Edge, type Node, type NodeProps, type NodeChange, type ReactFlowInstance } from "@xyflow/react";
import { LayoutGrid, Plus, List, X } from "lucide-react";
import { WorkflowActionMenu } from "./workflow-action-menu";
import { Control } from "@/components/ui/control";
import { Input } from "@/components/ui/input";
import { revealWorkflowCard } from "@/lib/workflow-editor-navigation";
import { Select } from "@/components/ui/select";
import type { AgentPanelRoleTarget } from "@/lib/agent-panel-roles";
import { WORKFLOW_COMPOSER_NODE_DRAG_THRESHOLD, layoutWorkflowComposer, type WorkflowNodePositions } from "@/lib/workflow-composer";
import { reflowExpandedWorkflowCards, workflowBasePositionAfterDrag, type WorkflowNodeMeasurements } from "@/lib/workflow-composer-layout";
import type { WorkflowDefinitionV1, WorkflowStep } from "@/lib/workflow-schema";
import type { DesignerStepKind, WorkflowInsertion } from "@/lib/workflow-designer";

const LABELS: Record<DesignerStepKind, string> = { "role-assign": "Role assignment", condition: "Condition", approval: "Approval", artifact: "Artifact", decision: "Decision" };
type CardNode = Node<{ content: ReactNode; step?: WorkflowStep; trigger?: boolean; terminal?: boolean; expanded: boolean; description?: string }, "card">;
function ComposerNode({ data, selected }: NodeProps<CardNode>) {
  return <div className={`workflow-composer-node${data.expanded ? " is-expanded" : ""}${data.terminal ? " is-terminal" : ""}${data.terminal && selected ? " is-selected" : ""}`}>
    {!data.trigger ? <Handle type="target" position={Position.Top} id="target" aria-label="Connect input" /> : null}
    <div>{data.content}</div>
    {data.description && !data.expanded ? <p className="workflow-composer-node-detail">{data.description}</p> : null}
    {data.step?.kind === "condition" ? <>
      <span className="workflow-composer-port-label yes">Yes</span><Handle type="source" position={Position.Bottom} id="then" style={{ left: "30%" }} aria-label="Yes output" />
      <span className="workflow-composer-port-label no">No</span><Handle type="source" position={Position.Bottom} id="else" style={{ left: "75%" }} aria-label="No output" />
    </> : !data.terminal ? <Handle type="source" position={Position.Bottom} id="next" isConnectable={!data.trigger} aria-label="Next output" /> : null}
  </div>;
}
const NODE_TYPES = { card: ComposerNode };

export function WorkflowComposerCanvas({ definition, selectedStepId, positions, roleTargets, renderStep, renderTrigger, onSelect, onPositions, onConnect, onAdd, onDuplicate, onRemove, onUndo, onRedo, toolbarContent, initialViewport, onViewportChange }: {
  initialViewport?: { x: number; y: number; zoom: number } | null;
  onViewportChange?: (viewport: { x: number; y: number; zoom: number }) => void;
  toolbarContent?: ReactNode;
  definition: WorkflowDefinitionV1; selectedStepId: string; positions: WorkflowNodePositions; roleTargets: AgentPanelRoleTarget[];
  renderStep: (step: WorkflowStep, index: number) => ReactNode; renderTrigger: ReactNode;
  onSelect: (id: string) => void; onPositions: (positions: WorkflowNodePositions) => void;
  onConnect: (source: string, target: string, handle: "next" | "then" | "else") => void;
  onAdd: (kind: DesignerStepKind, location?: WorkflowInsertion) => void;
  onDuplicate: () => void; onRemove: () => void; onUndo: () => void; onRedo: () => void;
}) {
  const [branch, setBranch] = useState<"then" | "else">("then");
  const canvasHost = useRef<HTMLDivElement>(null);
  const flow = useRef<ReactFlowInstance<CardNode> | null>(null);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const outlineButton = useRef<HTMLButtonElement>(null);
  function closeOutline() { setOutlineOpen(false); outlineButton.current?.focus(); }
  const [search, setSearch] = useState("");
  const selected = definition.steps.find((step) => step.id === selectedStepId);
  const automatic = useMemo(() => layoutWorkflowComposer(definition), [definition]);
  const [measurements, setMeasurements] = useState<WorkflowNodeMeasurements>({});
  const dragOffset = useRef<Record<string, { x: number; y: number }>>({});
  const basePositions = useMemo(() => Object.fromEntries(Object.entries(automatic).map(([id, point]) => [id, positions[id] ?? point])), [automatic, positions]);
  const expandedId = selectedStepId ? selectedStepId === "trigger" ? "trigger" : `step:${selectedStepId}` : null;
  const [dragDisplayOffsets, setDragDisplayOffsets] = useState<{ expandedId: string | null; offsets: WorkflowNodePositions }>({ expandedId: null, offsets: {} });
  useEffect(() => { setDragDisplayOffsets({ expandedId, offsets: {} }); }, [expandedId]);
  const displayPositions = useMemo(() => {
    const offsets = expandedId && dragDisplayOffsets.expandedId === expandedId ? dragDisplayOffsets.offsets : {};
    const preferred = Object.fromEntries(Object.entries(basePositions).map(([id, point]) => [id, { x: point.x + (offsets[id]?.x ?? 0), y: point.y + (offsets[id]?.y ?? 0) }]));
    return reflowExpandedWorkflowCards(preferred, measurements, expandedId);
  }, [basePositions, measurements, expandedId, dragDisplayOffsets]);
  function displayOffset(id: string) {
    const base = basePositions[id] ?? { x: 0, y: 0 }; const display = displayPositions[id] ?? base;
    return { x: display.x - base.x, y: display.y - base.y };
  }
  function persistNodePosition(node: Pick<CardNode, "id" | "position">, offset = displayOffset(node.id)) {
    const next = workflowBasePositionAfterDrag(node.position, offset);
    if (next.x === basePositions[node.id]?.x && next.y === basePositions[node.id]?.y) return;
    if (expandedId) setDragDisplayOffsets((current) => ({ expandedId, offsets: { ...(current.expandedId === expandedId ? current.offsets : {}), [node.id]: offset } }));
    onPositions({ ...positions, [node.id]: next });
  }
  const edges = useMemo<Edge[]>(() => {
    const list: Edge[] = [];
    const targetId = (target: string) => ["complete", "blocked", "escalate"].includes(target) ? `terminal:${target}` : `step:${target}`;
    const edge = (source: string, target: string, handle: string, label?: string): Edge => ({ id: `${source}:${handle}`, source, target: targetId(target), sourceHandle: handle, targetHandle: "target", label, type: "smoothstep", reconnectable: source !== "trigger" ? "target" : false, markerEnd: { type: MarkerType.ArrowClosed, color: "var(--text-muted)" }, style: { stroke: "var(--text-muted)" }, labelStyle: { fill: "var(--text-muted)", fontSize: 12 }, labelBgStyle: { fill: "var(--base)" } });
    if (definition.steps[0]) list.push(edge("trigger", definition.steps[0].id, "next"));
    for (const step of definition.steps) {
      if (step.kind === "condition") list.push(edge(`step:${step.id}`, step.then, "then", "Yes"), edge(`step:${step.id}`, step.else, "else", "No"));
      else list.push(edge(`step:${step.id}`, step.next ?? "complete", "next"));
    }
    return list;
  }, [definition]);
  const modelNodes = useMemo<CardNode[]>(() => {
    const position = (id: string) => displayPositions[id] ?? { x: 0, y: 0 };
    const outcomes = ["terminal:complete", "terminal:blocked", "terminal:escalate"];
    return [
      { id: "trigger", type: "card", position: position("trigger"), data: { trigger: true, expanded: selectedStepId === "trigger", content: selectedStepId === "trigger" ? renderTrigger : <button className="w-full rounded-[var(--r-ctl)] bg-[var(--raised)] p-3 text-left" onClick={() => onSelect("trigger")}><span className="text-[var(--t-meta)] text-[var(--text-muted)]">Trigger</span><strong className="mt-1 block text-[var(--t-ui)]">{definition.trigger.kind === "manual" ? "Start manually" : "Panel message"}</strong><span className="mt-1 block text-[var(--t-meta)] text-[var(--text-muted)]">{definition.inputs.length ? `Inputs · ${definition.inputs.map((input) => input.key).join(", ")}` : "No inputs required"}</span></button> } },
      ...definition.steps.map((step, index): CardNode => ({ id: `step:${step.id}`, type: "card", position: position(`step:${step.id}`), data: { step, expanded: selectedStepId === step.id, content: renderStep(step, index) } })),
      ...outcomes.map((id): CardNode => ({ id, type: "card", draggable: true, selectable: true, focusable: true, ariaLabel: `${id.slice(9)} outcome`, position: position(id), data: { terminal: true, expanded: false, content: <div className="rounded-[var(--r-ctl)] border border-[var(--border)] bg-[var(--base)] p-3 text-[var(--t-meta)]">{id.slice(9) === "complete" ? "Complete" : id.slice(9) === "blocked" ? "Blocked" : "Escalate"}</div> } })),
    ];
  }, [displayPositions, definition, onSelect, renderStep, renderTrigger, roleTargets, selectedStepId]);
  const [nodes, setNodes] = useState<CardNode[]>(modelNodes);
  function changeNodes(changes: NodeChange<CardNode>[]) {
    setNodes((current) => applyNodeChanges(changes, current));
    const dimensions = changes.filter((change) => change.type === "dimensions" && change.dimensions);
    if (dimensions.length) setMeasurements((current) => {
      const next = { ...current }; let changed = false;
      for (const change of dimensions) {
        if (change.type !== "dimensions" || !change.dimensions) continue;
        const size = change.dimensions;
        if (size.width > 0 && size.height > 0 && (current[change.id]?.width !== size.width || current[change.id]?.height !== size.height)) { next[change.id] = size; changed = true; }
      }
      return changed ? next : current;
    });
  }
  const previousModelNodes = useRef(modelNodes);
  useEffect(() => {
    const previous = new Map(previousModelNodes.current.map((node) => [node.id, node]));
    previousModelNodes.current = modelNodes;
    setNodes((current) => {
      const live = new Map(current.map((node) => [node.id, node]));
      return modelNodes.map((model) => {
        const node = live.get(model.id);
        const prior = previous.get(model.id);
        if (!node || !prior) return model;
        // Polling updates card content while dragging. Only an actual model
        // position change (commit, undo, or auto layout) may replace live geometry.
        const moved = prior.position.x !== model.position.x || prior.position.y !== model.position.y;
        return { ...node, ...model, position: moved ? model.position : node.position };
      });
    });
  }, [modelNodes]);
  function reveal(id: string) {
    const instance = flow.current, host = canvasHost.current;
    const node = instance?.getNode(id);
    if (!instance || !host || !node) return;
    const viewport = instance.getViewport();
    const next = revealWorkflowCard(viewport, { ...node.position, width: node.measured?.width ?? (node.data.expanded ? 380 : 280), height: node.measured?.height ?? 140 }, { width: host.clientWidth, height: host.clientHeight });
    if (next !== viewport) void instance.setViewport(next, { duration: 160 });
  }
  useEffect(() => {
    if (!expandedId) return;
    const timer = setTimeout(() => reveal(expandedId), 80);
    return () => clearTimeout(timer);
  }, [expandedId]);
  const outlineItems = [
    { id: "trigger", label: "Trigger and inputs", detail: definition.trigger.kind === "manual" ? "Start manually" : "Panel message" },
    ...definition.steps.map((step, index) => ({ id: `step:${step.id}`, label: step.title, detail: `${index + 1} · ${LABELS[step.kind]}${step.kind === "role-assign" ? ` · ${roleTargets.find((role) => role.roleKey === step.role)?.roleName ?? step.role.replaceAll("_", " ")}` : ""}` })),
    ...["Complete", "Blocked", "Escalate"].map((label) => ({ id: `terminal:${label.toLowerCase()}`, label, detail: "Outcome" })),
  ].filter((item) => `${item.label} ${item.detail}`.toLowerCase().includes(search.toLowerCase()));
  function connect(connection: Connection) {
    if (!connection.source?.startsWith("step:") || !connection.target) return;
    const target = connection.target.startsWith("step:") ? connection.target.slice(5) : connection.target.startsWith("terminal:") ? connection.target.slice(9) : null;
    if (target) onConnect(connection.source.slice(5), target, connection.sourceHandle === "then" || connection.sourceHandle === "else" ? connection.sourceHandle : "next");
  }
  return <div className="workflow-composer relative flex min-h-0 flex-1 flex-col" aria-label="Editable workflow canvas" onKeyDown={(event) => {
    if ((event.target as HTMLElement).closest("input,textarea,select,[contenteditable='true']")) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") { event.preventDefault(); event.stopPropagation(); if (event.shiftKey) onRedo(); else onUndo(); }
    const outcomeFocused = (event.target as HTMLElement).closest('.react-flow__node[data-id^="terminal:"]');
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d" && selected && !outcomeFocused) { event.preventDefault(); onDuplicate(); }
    if ((event.key === "Delete" || event.key === "Backspace") && selected && !outcomeFocused) { event.preventDefault(); onRemove(); }
    if (event.key === "Escape") onSelect("");
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
      const nodeId = (event.target as HTMLElement).closest(".react-flow__node")?.getAttribute("data-id");
      if (nodeId) { const offset = displayOffset(nodeId); setTimeout(() => { const node = flow.current?.getNode(nodeId); if (node) persistNodePosition(node, offset); }, 0); }
    }
  }}>
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--border)] bg-[var(--base)] px-3 py-2">
      <WorkflowActionMenu label="Add step" actions={Object.entries(LABELS).map(([kind, label]) => ({ label, onSelect: () => onAdd(kind as DesignerStepKind, selected ? { afterStepId: selected.id, ...(selected.kind === "condition" ? { branch } : {}) } : undefined) }))}><Plus aria-hidden className="h-4 w-4" />Add step</WorkflowActionMenu>
      {selected?.kind === "condition" ? <Select aria-label="New step branch" value={branch} onChange={(event) => setBranch(event.target.value as "then" | "else")} controlSize="sm"><option value="then">Yes branch</option><option value="else">No branch</option></Select> : null}
      <Control size="icon" variant="quiet" aria-label="Auto layout" title="Auto layout" onClick={() => { onPositions({}); setTimeout(() => { void flow.current?.fitView({ padding: 0.2, maxZoom: 1, duration: 180 }); }, 100); }}><LayoutGrid aria-hidden className="h-4 w-4" /></Control>
      <Control ref={outlineButton} size="icon" variant="quiet" aria-label="Workflow outline" aria-expanded={outlineOpen} title="Find a step" onClick={() => setOutlineOpen((open) => !open)}><List aria-hidden className="h-4 w-4" /></Control>
      {toolbarContent}
    </div>
    <div className="relative flex min-h-0 flex-1">
    {outlineOpen ? <nav aria-label="Workflow outline" onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); closeOutline(); } }} className="absolute inset-y-0 left-0 z-10 flex w-60 max-w-full flex-col border-r border-[var(--border)] bg-[var(--base)] p-3">
      <div className="mb-2 flex items-center justify-between"><span className="text-[var(--t-ui)] font-medium">Outline</span><Control size="icon" variant="quiet" aria-label="Close workflow outline" onClick={closeOutline}><X className="h-4 w-4" /></Control></div>
      <Input autoFocus aria-label="Find a workflow step" placeholder="Find a step…" value={search} onChange={(event) => setSearch(event.target.value)} />
      <div className="mt-2 min-h-0 overflow-y-auto">{outlineItems.length ? outlineItems.map((item) => <button key={item.id} className="mb-1 w-full rounded-[var(--r-ctl)] px-2 py-2 text-left hover:bg-[var(--raised)]" onClick={() => {
        onSelect(item.id === "trigger" ? "trigger" : item.id.startsWith("step:") ? item.id.slice(5) : "");
        setOutlineOpen(false);
        setTimeout(() => { reveal(item.id); canvasHost.current?.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(item.id)}"]`)?.focus({ preventScroll: true }); }, 100);
      }}><strong className="block text-[var(--t-ui)] font-medium">{item.label}</strong><span className="text-[var(--t-meta)] text-[var(--text-muted)]">{item.detail}</span></button>) : <p className="py-3 text-[var(--t-meta)] text-[var(--text-muted)]">No matching steps</p>}</div>
    </nav> : null}
    <div ref={canvasHost} className="relative min-h-0 flex-1" onFocusCapture={(event) => {
      const field = event.target as HTMLElement;
      if (!field.matches("input,select,textarea")) return;
      requestAnimationFrame(() => {
        const instance = flow.current, host = canvasHost.current;
        if (!instance || !host || !field.isConnected) return;
        const bounds = field.getBoundingClientRect(), area = host.getBoundingClientRect(), viewport = instance.getViewport();
        const next = revealWorkflowCard(viewport, { x: (bounds.left - area.left - viewport.x) / viewport.zoom, y: (bounds.top - area.top - viewport.y) / viewport.zoom, width: bounds.width / viewport.zoom, height: bounds.height / viewport.zoom }, { width: area.width, height: area.height });
        if (next !== viewport) void instance.setViewport(next);
      });
    }}>
    <ReactFlow<CardNode> nodes={nodes} edges={edges} nodeTypes={NODE_TYPES} onInit={(instance) => { flow.current = instance; void instance.setViewport(initialViewport ?? { x: Math.max(45, (canvasHost.current?.clientWidth ?? 700) / 2 - 126), y: 24, zoom: 0.9 }); }}
      onMoveEnd={(_, viewport) => onViewportChange?.(viewport)}
      onNodesChange={changeNodes}
      onNodeDragStart={(_, node) => { dragOffset.current[node.id] = displayOffset(node.id); }}
      onNodeDragStop={(_, node) => { persistNodePosition(node, dragOffset.current[node.id] ?? displayOffset(node.id)); delete dragOffset.current[node.id]; }}
      onNodeClick={(event, node) => { if ((event.target as HTMLElement).closest("input,textarea,select,button,summary")) return; if (node.data.step) onSelect(node.data.step.id); else if (node.id === "trigger") onSelect("trigger"); else if (node.data.terminal) onSelect(""); }}
      onNodeDoubleClick={(_, node) => { if (node.data.step) onSelect(node.data.step.id); }}
      onPaneClick={() => onSelect("")} onConnect={connect} onReconnect={(_, connection) => connect(connection)}
      nodeDragThreshold={WORKFLOW_COMPOSER_NODE_DRAG_THRESHOLD} nodesDraggable nodesConnectable edgesReconnectable deleteKeyCode={null} edgesFocusable={false} minZoom={0.2} maxZoom={1.5} proOptions={{ hideAttribution: true }}>
      <Background gap={24} size={1} color="var(--border)" /><Controls showInteractive={false} />
    </ReactFlow>
    </div>
    </div>
  </div>;
}
