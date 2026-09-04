export interface BlockReason {
  word: string;
  needsYou: boolean;
}

/** Hermes block kinds are routing facts. Only `needs_input` means a person
 * is needed; an empty kind stays unknown instead of borrowing that alarm. */
export function blockReason(kind: string): BlockReason | null {
  switch (kind) {
    case "needs_input":
      return { word: "waiting on you", needsYou: true };
    case "transient":
      return { word: "failed, will retry", needsYou: false };
    case "dependency":
      return { word: "waiting on another task", needsYou: false };
    case "":
      return null;
    default:
      return { word: kind.replace(/_/g, " "), needsYou: false };
  }
}
