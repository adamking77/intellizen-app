import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { Hunk, Proposal } from "./types";

export interface DocumentProposalReview {
  revision: number;
  documentId: string;
  docPath: string;
  title: string;
  proposals: Proposal[];
  busy: boolean;
  error: string | null;
}

export interface DocumentProposalDecision {
  documentId: string;
  docPath: string;
  proposalId: string;
  taken: Hunk[];
  dropped: Hunk[];
}

interface Registration {
  review: Omit<DocumentProposalReview, "revision">;
  decide: (decision: DocumentProposalDecision) => Promise<void>;
}

type Register = (owner: string, registration: Registration | null) => void;
const RegistrationContext = createContext<Register>(() => undefined);

export function DocumentProposalProvider({ register, children }: { register: Register; children: ReactNode }) {
  return <RegistrationContext.Provider value={register}>{children}</RegistrationContext.Provider>;
}

export function useRegisterDocumentProposal(owner: string, registration: Registration | null) {
  const register = useContext(RegistrationContext);
  useEffect(() => {
    register(owner, registration);
    return () => register(owner, null);
  }, [owner, register, registration]);
}

export function useDocumentProposalBridge() {
  const revision = useRef(0);
  const current = useRef<{ owner: string; registration: Registration } | null>(null);
  const [review, setReview] = useState<DocumentProposalReview | null>(null);
  const register = useCallback<Register>((owner, registration) => {
    if (!registration) {
      if (current.current?.owner === owner) {
        current.current = null;
        setReview(null);
      }
      return;
    }
    current.current = { owner, registration };
    setReview({ ...registration.review, revision: ++revision.current });
  }, []);
  const decide = useCallback(async (decision: DocumentProposalDecision) => {
    const active = current.current;
    if (!active || active.registration.review.documentId !== decision.documentId || active.registration.review.docPath !== decision.docPath) {
      throw new Error("The open document changed. Review the current proposal before deciding.");
    }
    await active.registration.decide(decision);
  }, []);
  return useMemo(() => ({ review, decide, register }), [review, decide, register]);
}
