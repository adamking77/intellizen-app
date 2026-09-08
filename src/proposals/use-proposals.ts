import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import { recordProposalDecision } from "@/lib/data/work-receipts";
import type { Hunk, Proposal } from "./types";

async function proposalReceipt(input: Parameters<typeof recordProposalDecision>[0]) {
  try {
    await recordProposalDecision(input);
    return null;
  } catch (error) {
    return `The document decision was applied, but its Activity receipt failed: ${String(error)}`;
  }
}

/** What is waiting on the open document, and the decisions about it.
 *
 *  A proposal arrives as a file the MCP server writes; nothing calls back into
 *  the app when that happens, so this polls.
 *
 *  ponytail: 2s poll while a document is open, nothing when one is not. Ceiling
 *  is a proposal taking two seconds to show. Upgrade path is a Tauri event from
 *  a `notify` watcher on the proposals folder; accept/reject do not change. */
export function useProposals(docPath: string | null) {
  const [proposals, setProposals] = useState<Proposal[] | null>(docPath ? null : []);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const pathRef = useRef(docPath);
  const reloadRef = useRef(0);
  pathRef.current = docPath;

  const reload = useCallback(async () => {
    const request = ++reloadRef.current;
    if (!docPath) {
      setProposals([]);
      setLoadError(null);
      return;
    }
    try {
      const next = await invoke<Proposal[]>("proposals_list", { docPath });
      if (request !== reloadRef.current || pathRef.current !== docPath) return;
      setProposals(next);
      setLoadError(null);
    } catch (cause) {
      if (request !== reloadRef.current || pathRef.current !== docPath) return;
      setProposals(null);
      setLoadError(`Suggested edits could not be read: ${String(cause)}`);
    }
  }, [docPath]);

  useEffect(() => {
    setLoadError(null);
    setActionError(null);
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
      if (busyRef.current) throw new Error("A document proposal decision is already in progress.");
      busyRef.current = true;
      setBusy(true);
      setActionError(null);
      try {
        let text: string | null = null;
        let receiptError: string | null = null;
        if (taken.length > 0) {
          text = await invoke<string>("proposal_accept_hunk", { docPath, id, hunks: taken });
          receiptError = await proposalReceipt({ proposalId: id, docPath, decision: "accepted", hunkCount: taken.length, actor: "Adam" });
        }
        if (dropped.length > 0) {
          try {
            await invoke("proposal_reject_hunk", { docPath, id, hunks: dropped });
            const droppedReceiptError = await proposalReceipt({ proposalId: id, docPath, decision: "rejected", hunkCount: dropped.length, actor: "Adam" });
            receiptError ??= droppedReceiptError;
          } catch (cause) {
            if (text === null) throw cause;
            receiptError = `The accepted edits were applied, but the rejected edits could not be removed: ${String(cause)}`;
          }
        }
        setActionError(receiptError);
        return text;
      } catch (e) {
        setActionError(String(e));
        throw e;
      } finally {
        busyRef.current = false;
        setBusy(false);
        void reload();
      }
    },
    [docPath, reload],
  );

  return { proposals, accept, busy, error: actionError ?? loadError, reload };
}

/** Counts waiting hunks so the document rail can lift them above folders. */
export function useProposalCounts(paths: string[]) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const key = paths.join("\n");

  useEffect(() => {
    if (!key) {
      setCounts({});
      return;
    }
    const currentPaths = key.split("\n");
    let live = true;
    const reload = async () => {
      const rows = await Promise.all(currentPaths.map(async (docPath) => {
        try {
          const proposals = await invoke<Proposal[]>("proposals_list", { docPath });
          return [docPath, proposals.reduce((sum, proposal) => sum + proposal.hunks.length, 0)] as const;
        } catch {
          return [docPath, 0] as const;
        }
      }));
      if (live) setCounts(Object.fromEntries(rows));
    };
    void reload();
    const timer = window.setInterval(() => void reload(), 5000);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [key]);

  return counts;
}
