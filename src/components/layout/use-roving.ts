import { useCallback, useEffect, useRef } from "react";

const ROW = '[role="treeitem"]';

/** Where Up/Down/Home/End land, given the focused index (-1 when none). */
export function nextIndex(key: string, at: number, count: number): number | null {
  if (count === 0) return null;
  switch (key) {
    case "ArrowDown":
      return at === -1 ? 0 : Math.min(count - 1, at + 1);
    case "ArrowUp":
      return at === -1 ? 0 : Math.max(0, at - 1);
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

/** Roving tabindex over the visible `role="treeitem"` rows of a tree.
 *
 *  Read from the DOM rather than a flattened model: the rendered rows are the
 *  answer, in order, whatever is expanded. Exactly one row is in the tab order;
 *  the selected one when there is one, otherwise the first. Left and Right stay
 *  with the tree, which knows what expanding means. */
export function useTreeRoving() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rows = Array.from(el.querySelectorAll<HTMLElement>(ROW));
    if (rows.length === 0 || rows.some((r) => r === document.activeElement)) return;
    const chosen = rows.find((r) => r.getAttribute("aria-selected") === "true") ?? rows[0];
    for (const r of rows) r.tabIndex = r === chosen ? 0 : -1;
  });

  const onKeyDown = useCallback((e: React.KeyboardEvent): boolean => {
    const el = ref.current;
    if (!el) return false;
    const rows = Array.from(el.querySelectorAll<HTMLElement>(ROW));
    const at = rows.indexOf(document.activeElement as HTMLElement);
    const next = nextIndex(e.key, at, rows.length);
    if (next === null) return false;
    e.preventDefault();
    rows[next]?.focus();
    return true;
  }, []);

  const focusRow = useCallback((id: string | null) => {
    if (!id) return;
    ref.current?.querySelector<HTMLElement>(`${ROW}[data-id="${id}"]`)?.focus();
  }, []);

  return { ref, onKeyDown, focusRow };
}
