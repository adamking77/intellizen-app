import { expect, it } from "vitest";
import { reflowExpandedWorkflowCards, workflowBasePositionAfterDrag } from "./workflow-composer-layout";
it("uses measured trigger height and cascades collisions through downstream cards", () => {
  const base = { trigger: { x: 0, y: 0 }, role: { x: 0, y: 180 }, decision: { x: 0, y: 370 }, branch: { x: 430, y: 370 } };
  const sizes = { trigger: { width: 380, height: 935 }, role: { width: 280, height: 141 }, decision: { width: 280, height: 100 }, branch: { width: 280, height: 100 } };
  const display = reflowExpandedWorkflowCards(base, sizes, "trigger");
  expect(display.role).toEqual({ x: 0, y: 963 }); expect(display.decision).toEqual({ x: 0, y: 1132 });
  expect(display.branch).toEqual(base.branch); expect(base.role.y).toBe(180);
  expect(reflowExpandedWorkflowCards(base, sizes, null)).toBe(base);
});
it("respects manually positioned cards while reacting to details expansion and wrapped width", () => {
  const base = { expanded: { x: 80, y: 50 }, neighbor: { x: 410, y: 160 }, below: { x: 410, y: 360 } };
  const sizes = { expanded: { width: 420, height: 702 }, neighbor: { width: 250, height: 154 }, below: { width: 300, height: 220 } };
  const display = reflowExpandedWorkflowCards(base, sizes, "expanded");
  expect(display.expanded).toEqual(base.expanded); expect(display.neighbor).toEqual({ x: 410, y: 780 }); expect(display.below).toEqual({ x: 410, y: 962 });
  const resized = reflowExpandedWorkflowCards(base, { ...sizes, expanded: { width: 420, height: 1110 } }, "expanded");
  expect(resized.neighbor.y).toBe(1188); expect(resized.below.y).toBe(1370);
});
it("stores only the drag delta while retaining its temporary display offset until collapse", () => {
  const base = { trigger: { x: 0, y: 0 }, role: { x: 0, y: 180 } }; const sizes = { trigger: { width: 380, height: 500 }, role: { width: 280, height: 110 } };
  const display = reflowExpandedWorkflowCards(base, sizes, "trigger"); const offset = { x: 0, y: display.role.y - base.role.y };
  const nextBase = workflowBasePositionAfterDrag({ x: 90, y: display.role.y + 50 }, offset);
  expect(nextBase).toEqual({ x: 90, y: 230 });
  const temporary = { ...base, role: { x: nextBase.x, y: nextBase.y + offset.y } };
  expect(reflowExpandedWorkflowCards(temporary, sizes, "trigger").role).toEqual({ x: 90, y: 578 });
  expect(reflowExpandedWorkflowCards({ ...base, role: nextBase }, sizes, null).role).toEqual(nextBase);
});
