export const DRY_RUN_BANNER = "⛔ DRY RUN — NOTHING WRITTEN ⛔";

export function dryRunPreview(
  action: string,
  writeInstruction: string,
  payload: Record<string, unknown> = {},
) {
  return {
    banner: DRY_RUN_BANNER,
    dry_run: true,
    write_performed: false,
    ...payload,
    action,
    message: `${DRY_RUN_BANNER}\nPreview only. Re-run with confirm_write: true to ${writeInstruction}.`,
  };
}

export type HomePinPlacement = { x: number; y: number; w: number; h: number };

function homePinsOverlap(left: HomePinPlacement, right: HomePinPlacement) {
  return !(
    left.x + left.w <= right.x ||
    right.x + right.w <= left.x ||
    left.y + left.h <= right.y ||
    right.y + right.h <= left.y
  );
}

export function resolveHomePinPlacement(
  existing: HomePinPlacement[],
  requested: { x?: number; y?: number; w: number; h: number },
  gridColumns = 12,
): HomePinPlacement {
  const { w, h } = requested;

  if (requested.x !== undefined || requested.y !== undefined) {
    if (requested.x === undefined || requested.y === undefined) {
      throw new Error("x and y must be supplied together when setting an explicit Home grid position.");
    }
    if (!Number.isInteger(requested.x) || !Number.isInteger(requested.y)) {
      throw new Error("x and y must be integers.");
    }
    if (requested.x < 0 || requested.y < 0 || requested.x + w > gridColumns) {
      throw new Error(`Home grid position must fit within columns 0-${gridColumns - 1} and use y >= 0.`);
    }
    return { x: requested.x, y: requested.y, w, h };
  }

  // Match the frontend's bento grid: choose the first open slot,
  // scanning left-to-right and then top-to-bottom while preserving dragged pins.
  const maxBottom = existing.reduce((max, pin) => Math.max(max, pin.y + pin.h), 0);
  for (let y = 0; y <= maxBottom; y += 1) {
    for (let x = 0; x + w <= gridColumns; x += 1) {
      const candidate = { x, y, w, h };
      if (!existing.some((pin) => homePinsOverlap(candidate, pin))) return candidate;
    }
  }
  return { x: 0, y: maxBottom, w, h };
}
