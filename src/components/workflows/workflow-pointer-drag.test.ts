// @vitest-environment happy-dom
// @ts-expect-error Node test-harness APIs are outside the browser tsconfig types.
import { createRequire } from "node:module";
// @ts-expect-error Node test-harness APIs are outside the browser tsconfig types.
import { dirname } from "node:path";
import { expect, it } from "vitest";
import { WORKFLOW_COMPOSER_NODE_DRAG_THRESHOLD } from "@/lib/workflow-composer";

// Exercise the actual installed XYFlow/D3 pointer implementation, not mocked callbacks.
const require = createRequire(import.meta.url);
const { XYDrag } = require(require.resolve("@xyflow/system", { paths: [dirname(require.resolve("@xyflow/react"))] }));
function dragWithSingleMove(threshold: number, target: "body" | "field" | "control" = "body") {
  const element = document.createElement("div");
  const handle = document.createElement("div"); handle.className = target === "body" ? "workflow-composer-node" : "nodrag nopan";
  element.append(handle); document.body.append(element);
  const node = { id: "step:one", position: { x: 0, y: 0 }, selected: true, measured: { width: 280, height: 100 }, internals: { positionAbsolute: { x: 0, y: 0 }, userNode: { id: "step:one", position: { x: 0, y: 0 }, data: {} } } };
  const stopped: Array<{ x: number; y: number }> = [];
  const store = { domNode: element, nodeLookup: new Map([[node.id, node]]), nodeDragThreshold: threshold, nodesDraggable: true, transform: [0, 0, 1], snapGrid: [1, 1], snapToGrid: false, nodeOrigin: [0, 0], nodeExtent: [[-Infinity, -Infinity], [Infinity, Infinity]], autoPanOnNodeDrag: false, selectNodesOnDrag: true, updateNodePositions: () => {}, onNodeDragStop: (_: unknown, moved: { position: { x: number; y: number } }) => stopped.push(moved.position) };
  const drag = XYDrag({ getStoreItems: () => store });
  drag.update({ domNode: element, nodeId: node.id, isSelectable: true, noDragClassName: "nodrag", handleSelector: undefined });
  try {
    handle.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 20, clientY: 20, button: 0, view: window }));
    window.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 220, clientY: 120, buttons: 1, view: window }));
    window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: 220, clientY: 120, button: 0, view: window }));
    return stopped;
  } finally { drag.destroy(); element.remove(); }
}
it("moves a card body even when native pointer movement is coalesced into one event", () => {
  expect(dragWithSingleMove(1)).toEqual([{ x: 0, y: 0 }]); // Default threshold consumes the only movement as drag start.
  expect(dragWithSingleMove(WORKFLOW_COMPOSER_NODE_DRAG_THRESHOLD)).toEqual([{ x: 200, y: 100 }]);
});

it.each(["field", "control"] as const)("keeps %s interactions out of the installed pointer drag implementation", (target) => {
  expect(dragWithSingleMove(WORKFLOW_COMPOSER_NODE_DRAG_THRESHOLD, target)).toEqual([]);
});
