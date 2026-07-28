import "@xyflow/react/dist/style.css";
import "./workflow-topology.css";

import {
  Background,
  ConnectionMode,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import {
  CheckCircle2,
  CircleDot,
  FileOutput,
  GitBranch,
  Handshake,
  Play,
  ShieldCheck,
  UserRoundCheck,
  Wrench,
} from "lucide-react";
import { useMemo } from "react";

import type {
  WorkflowTopology as WorkflowTopologyModel,
  WorkflowTopologyNode,
} from "@/lib/workflow-topology";
import { cn } from "@/lib/utils";

type WorkflowFlowData = WorkflowTopologyNode & {
  selected: boolean;
  editable: boolean;
  outgoingHandles: Array<"next" | "then" | "else">;
};

function NodeIcon({ kind }: { kind: WorkflowTopologyNode["kind"] }) {
  const className = "h-3.5 w-3.5";
  if (kind === "trigger") return <Play className={className} />;
  if (kind === "decision") return <GitBranch className={className} />;
  if (kind === "approval") return <ShieldCheck className={className} />;
  if (kind === "handoff") return <Handshake className={className} />;
  if (kind === "artifact") return <FileOutput className={className} />;
  if (kind === "verification") return <UserRoundCheck className={className} />;
  if (kind === "terminal") return <CheckCircle2 className={className} />;
  if (kind === "action") return <Wrench className={className} />;
  return <CircleDot className={className} />;
}

function WorkflowNodeView({ data }: NodeProps) {
  const node = data as unknown as WorkflowFlowData;
  const canTarget = node.kind !== "trigger";
  const canSource = node.kind !== "terminal";
  return (
    <div
      className={cn(
        "workflow-topology-node",
        `workflow-node-${node.kind}`,
        `workflow-node-state-${node.state}`,
        node.selected && "is-selected",
      )}
      role={node.stepId ? "button" : undefined}
      tabIndex={node.stepId ? 0 : undefined}
      aria-label={`${node.kind}: ${node.title}${node.blocker ? `, blocked: ${node.blocker}` : ""}`}
    >
      {canTarget ? (
        <Handle
          id="target"
          type="target"
          position={Position.Left}
          isConnectable={node.editable}
        />
      ) : null}
      <div className="workflow-node-kicker">
        <NodeIcon kind={node.kind} />
        <span>{node.kind}</span>
        {node.state !== "neutral" ? (
          <span className="workflow-node-state">{node.state}</span>
        ) : null}
      </div>
      <p className="workflow-node-title">{node.title}</p>
      {node.role ? (
        <p className="workflow-node-role">
          {node.role}
          {node.occupant ? ` · ${node.occupant}` : " · unstaffed"}
        </p>
      ) : node.detail ? (
        <p className="workflow-node-role">{node.detail}</p>
      ) : null}
      {node.execution ? (
        <p className="workflow-node-execution">{node.execution}</p>
      ) : null}
      {node.blocker ? (
        <p className="workflow-node-blocker">{node.blocker}</p>
      ) : null}
      {canSource && node.outgoingHandles.includes("next") ? (
        <Handle
          id="next"
          type="source"
          position={Position.Right}
          isConnectable={node.editable}
        />
      ) : null}
      {canSource && node.outgoingHandles.includes("then") ? (
        <Handle
          id="then"
          type="source"
          position={Position.Right}
          style={{ top: "35%" }}
          isConnectable={node.editable}
        />
      ) : null}
      {canSource && node.outgoingHandles.includes("else") ? (
        <Handle
          id="else"
          type="source"
          position={Position.Right}
          style={{ top: "70%" }}
          isConnectable={node.editable}
        />
      ) : null}
    </div>
  );
}

const NODE_TYPES = { workflow: WorkflowNodeView };

function StaticWorkflowTopology({
  topology,
  compact,
}: {
  topology: WorkflowTopologyModel;
  compact: boolean;
}) {
  const scale = compact ? 0.42 : 0.72;
  const nodeWidth = 210;
  const nodeHeight = 106;
  const minY = Math.min(...topology.nodes.map((node) => node.position.y), 0);
  const yShift = 42 - minY;
  const naturalWidth =
    Math.max(...topology.nodes.map((node) => node.position.x), 0) +
    nodeWidth +
    42;
  const naturalHeight =
    Math.max(...topology.nodes.map((node) => node.position.y + yShift), 0) +
    nodeHeight +
    42;
  const byId = new Map(topology.nodes.map((node) => [node.id, node]));

  return (
    <div
      className={cn(
        "workflow-topology workflow-topology-static-shell",
        compact && "workflow-topology-compact",
      )}
      style={{ height: naturalHeight * scale }}
      aria-label={`Workflow topology · ${topology.mode}`}
    >
      <div
        className="workflow-topology-static"
        style={{
          width: naturalWidth,
          height: naturalHeight,
          transform: `scale(${scale})`,
        }}
      >
        <svg
          className="workflow-topology-static-edges"
          width={naturalWidth}
          height={naturalHeight}
          aria-hidden="true"
        >
          <defs>
            <marker
              id={`workflow-arrow-${topology.mode}`}
              markerWidth="8"
              markerHeight="8"
              refX="7"
              refY="4"
              orient="auto"
            >
              <path d="M0,0 L8,4 L0,8 z" fill="var(--overlay-1)" />
            </marker>
          </defs>
          {topology.edges.map((edge) => {
            const source = byId.get(edge.source);
            const target = byId.get(edge.target);
            if (!source || !target) return null;
            const sourceLeft = source.position.x;
            const targetLeft = target.position.x;
            const runsBackward = targetLeft < sourceLeft;
            const sameColumn = targetLeft === sourceLeft;
            const sx = runsBackward
              ? sourceLeft
              : sourceLeft + nodeWidth;
            const sy =
              source.position.y +
              yShift +
              (edge.sourceHandle === "then"
                ? 38
                : edge.sourceHandle === "else"
                  ? 72
                  : 53);
            const tx = runsBackward || sameColumn
              ? targetLeft + nodeWidth
              : targetLeft;
            const ty = target.position.y + yShift + 53;
            const bend = Math.max(42, Math.abs(tx - sx) * 0.42);
            const direction = tx >= sx ? 1 : -1;
            const path = sameColumn
              ? `M ${sx} ${sy} C ${sx + 54} ${sy}, ${tx + 54} ${ty}, ${tx} ${ty}`
              : `M ${sx} ${sy} C ${sx + bend * direction} ${sy}, ${tx - bend * direction} ${ty}, ${tx} ${ty}`;
            return (
              <g key={edge.id}>
                <path
                  d={path}
                  fill="none"
                  stroke="var(--overlay-1)"
                  strokeWidth="1.5"
                  markerEnd={`url(#workflow-arrow-${topology.mode})`}
                />
                {edge.label ? (
                  <text
                    x={(sx + tx) / 2}
                    y={(sy + ty) / 2 - 6}
                    fill="var(--subtext-0)"
                    fontFamily="var(--font-mono)"
                    fontSize="10"
                  >
                    {edge.label}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
        {topology.nodes.map((node) => (
          <div
            key={node.id}
            className={cn(
              "workflow-topology-node workflow-topology-static-node",
              `workflow-node-${node.kind}`,
              `workflow-node-state-${node.state}`,
            )}
            style={{
              left: node.position.x,
              top: node.position.y + yShift,
            }}
            aria-label={`${node.kind}: ${node.title}${node.blocker ? `, blocked: ${node.blocker}` : ""}`}
          >
            <div className="workflow-node-kicker">
              <NodeIcon kind={node.kind} />
              <span>{node.kind}</span>
              {node.state !== "neutral" ? (
                <span className="workflow-node-state">{node.state}</span>
              ) : null}
            </div>
            <p className="workflow-node-title">{node.title}</p>
            {node.role ? (
              <p className="workflow-node-role">
                {node.role}
                {node.occupant ? ` · ${node.occupant}` : " · unstaffed"}
              </p>
            ) : node.detail ? (
              <p className="workflow-node-role">{node.detail}</p>
            ) : null}
            {node.execution ? (
              <p className="workflow-node-execution">{node.execution}</p>
            ) : null}
            {node.blocker ? (
              <p className="workflow-node-blocker">{node.blocker}</p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export function WorkflowTopology({
  topology,
  selectedStepId = null,
  editable = false,
  onSelectStep,
  onConnectEdge,
  compact = false,
}: {
  topology: WorkflowTopologyModel;
  selectedStepId?: string | null;
  editable?: boolean;
  onSelectStep?: (stepId: string) => void;
  onConnectEdge?: (
    sourceStepId: string,
    target: string,
    handle: "next" | "then" | "else",
  ) => void;
  compact?: boolean;
}) {
  const nodes = useMemo<Node[]>(
    () =>
      topology.nodes.map((node) => ({
        id: node.id,
        type: "workflow",
        position: node.position,
        draggable: false,
        selectable: Boolean(node.stepId),
        data: {
          ...node,
          selected: node.stepId === selectedStepId,
          editable,
          outgoingHandles: topology.edges
            .filter((edge) => edge.source === node.id)
            .map((edge) => edge.sourceHandle),
        } satisfies WorkflowFlowData,
      })),
    [editable, selectedStepId, topology.edges, topology.nodes],
  );
  const edges = useMemo<Edge[]>(
    () =>
      topology.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: "target",
        label: edge.label ?? undefined,
        type: "smoothstep",
        animated:
          topology.mode === "run" &&
          topology.nodes.find((node) => node.id === edge.source)?.state === "running",
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: "var(--overlay-1)",
        },
        style: {
          stroke: "var(--overlay-1)",
          strokeWidth: 1.4,
        },
        labelStyle: {
          fill: "var(--subtext-0)",
          fontFamily: "var(--font-mono)",
          fontSize: 9,
        },
        labelBgStyle: {
          fill: "var(--base)",
          fillOpacity: 0.9,
        },
      })),
    [topology.edges, topology.mode, topology.nodes],
  );

  if (!editable) {
    return <StaticWorkflowTopology topology={topology} compact={compact} />;
  }

  function connect(connection: Connection) {
    if (
      !editable ||
      !onConnectEdge ||
      !connection.source?.startsWith("step:") ||
      !connection.target
    ) {
      return;
    }
    const target = connection.target.startsWith("step:")
      ? connection.target.slice("step:".length)
      : connection.target.startsWith("terminal:")
        ? connection.target.slice("terminal:".length)
        : null;
    if (!target) return;
    const handle =
      connection.sourceHandle === "then" || connection.sourceHandle === "else"
        ? connection.sourceHandle
        : "next";
    onConnectEdge(
      connection.source.slice("step:".length),
      target,
      handle,
    );
  }

  return (
    <div
      className={cn(
        "workflow-topology",
        compact && "workflow-topology-compact",
      )}
      aria-label={`Workflow topology · ${topology.mode}`}
    >
      <ReactFlow
        key={`${topology.mode}-${compact ? "compact" : "full"}`}
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        onNodeClick={(_, node) => {
          const stepId = (node.data as unknown as WorkflowFlowData).stepId;
          if (stepId) onSelectStep?.(stepId);
        }}
        onConnect={connect}
        connectionMode={ConnectionMode.Loose}
        nodesConnectable={editable}
        nodesDraggable={false}
        elementsSelectable={!compact}
        fitView
        fitViewOptions={{ padding: compact ? 0.1 : 0.22, maxZoom: compact ? 0.65 : 1 }}
        minZoom={0.25}
        maxZoom={1.4}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={22} size={1} color="var(--border)" />
        {!compact ? <Controls showInteractive={false} /> : null}
        {!compact && topology.nodes.length >= 7 ? (
          <MiniMap
            pannable
            zoomable
            nodeColor="var(--surface-0)"
            maskColor="color-mix(in srgb, var(--crust) 78%, transparent)"
          />
        ) : null}
      </ReactFlow>
    </div>
  );
}
