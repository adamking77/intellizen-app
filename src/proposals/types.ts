/** Mirrors `src-tauri/src/proposals.rs` (camelCase across the bridge). */

export interface Hunk {
  id: number;
  /** First line of `old` in the document, zero-based. */
  at: number;
  old: string[];
  new: string[];
}

export interface Proposal {
  id: string;
  docPath: string;
  author: string;
  note: string;
  at: number;
  /** Against the document as it is on disk now; recomputed on every list. */
  hunks: Hunk[];
}

export interface Stat {
  added: number;
  removed: number;
}

export function hunkStat(h: Hunk): Stat {
  return { added: h.new.length, removed: h.old.length };
}

/** Counts over the hunks still taken, not the whole proposal: a figure that
 *  does not move as changes are unticked describes an edit you are no longer
 *  about to make. */
export function proposalStat(hunks: Hunk[]): Stat {
  return hunks.reduce<Stat>(
    (sum, h) => ({ added: sum.added + h.new.length, removed: sum.removed + h.old.length }),
    { added: 0, removed: 0 },
  );
}
