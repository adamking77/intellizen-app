import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import type { Hunk, Proposal } from "./types";

/** What is waiting on the open document, and the decisions about it.
 *
 *  A proposal arrives as a file the MCP server writes; nothing calls back into
 *  the app when that happens, so this polls.
 *
 *  ponytail: 2s poll while a document is open, nothing when one is not. Ceiling
 *  is a proposal taking two seconds to show. Upgrade path is a Tauri event from
 *  a `notify` watcher on the proposals folder; accept/reject do not change. */
export function useProposals(docPath: string | null) {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!docPath) {
      setProposals([]);
      return;
    }
    try {
      setProposals(await invoke<Proposal[]>("proposals_list", { docPath }));
    } catch {
      // A folder that cannot be read is "nothing waiting": the document is fine.
      setProposals([]);
    }
  }, [docPath]);

  useEffect(() => {
    setError(null);
    void reload();
    if (!docPath) return;
    const timer = setInterval(() => void reload(), 2000);
    return () => clearInterval(timer);
  }, [docPath, reload]);

  /** Write `taken` into the document and drop `dropped` from the proposal.
   *  Resolves to the document text after the write, or null if nothing was
   *  written. A failure is kept on the card: the document having changed
   *  underneath the review is the case that matters. */
  const accept = useCallback(
    async (id: string, taken: Hunk[], dropped: Hunk[]): Promise<string | null> => {
      if (!docPath) return null;
      setBusy(true);
      try {
        let text: string | null = null;
        if (taken.length > 0) {
          text = await invoke<string>("proposal_accept_hunk", { docPath, id, hunks: taken });
        }
        if (dropped.length > 0) {
          await invoke("proposal_reject_hunk", { docPath, id, hunks: dropped });
        }
        setError(null);
        return text;
      } catch (e) {
        setError(String(e));
        return null;
      } finally {
        setBusy(false);
        void reload();
      }
    },
    [docPath, reload],
  );

  const reject = useCallback(
    async (id: string) => {
      if (!docPath) return;
      setBusy(true);
      try {
        await invoke("proposal_reject_hunk", { docPath, id, hunks: [] });
        setError(null);
      } catch (e) {
        setError(String(e));
      } finally {
        setBusy(false);
        void reload();
      }
    },
    [docPath, reload],
  );

  return { proposals, accept, reject, busy, error, reload };
}
