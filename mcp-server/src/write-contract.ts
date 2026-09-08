import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

export const DRY_RUN_BANNER = "⛔ DRY RUN — NOTHING WRITTEN ⛔";

/** Add scalar metadata only; existing field definitions are never rewritten. */
export function additiveDatabaseFields(current: Array<{ id: string }>, additions: unknown) {
  if (!Array.isArray(additions) || additions.length === 0) throw new Error("add_fields must be a non-empty array.");
  const ids = new Set<string>();
  const added: Array<{ id: string; name: string; type: "text" | "select"; options?: string[] }> = [];
  for (const field of additions) {
    if (!field || typeof field !== "object" || Array.isArray(field)
      || typeof field.id !== "string" || !field.id.trim()
      || typeof field.name !== "string" || !field.name.trim()
      || !["text", "select"].includes(field.type)
      || Object.keys(field).some((key) => !["id", "name", "type", "options"].includes(key))) {
      throw new Error("Each added field requires id, name and type (text or select), with optional select options only.");
    }
    if (ids.has(field.id)) throw new Error(`Duplicate added field id: ${field.id}`);
    ids.add(field.id);
    if (field.type === "select") {
      if (!Array.isArray(field.options) || !field.options.length
        || field.options.some((option: unknown) => typeof option !== "string" || !option.trim())
        || new Set(field.options).size !== field.options.length) {
        throw new Error(`Select field ${field.id} requires unique non-empty string options.`);
      }
    } else if (field.options !== undefined) throw new Error("Text fields cannot have options.");
    const matches = current.filter((existing) => existing.id === field.id);
    if (matches.length > 1 || (matches.length === 1 && !isDeepStrictEqual(matches[0], field))) {
      throw new Error(`Field ${field.id} already exists with a different definition; additive writes cannot replace it.`);
    }
    if (!matches.length) added.push(field);
  }
  return { added, schema: [...current, ...added] };
}

export function databaseFieldsPreviewToken(databaseId: string, updatedAt: string, schema: unknown) {
  return createHash("sha256").update(JSON.stringify([databaseId, updatedAt, schema])).digest("hex");
}

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
