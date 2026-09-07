import { useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  conversationContextReferences,
  conversationContextForPrompt,
  conversationContextRouteLabel,
  omitConversationContextReference,
  publishConversationContext,
  readConversationContext,
  subscribeConversationContext,
  type ConversationContextReference,
} from "@/lib/conversation-context";

function referenceLabel(reference: ConversationContextReference, fallback: string) {
  if (reference.label) return reference.label;
  if (reference.kind === "workflow_run") return "Workflow run";
  if (reference.kind === "workflow_draft") return "Workflow draft";
  if (reference.kind === "workspace_record") return "Record";
  if (reference.kind === "vault_file" || reference.kind === "document") return "Document";
  if (reference.kind === "investigation") return "Investigation";
  return fallback;
}

/** The reference sent with the next turn, shared with the ejected panel. */
export function MaterialContext() {
  const [context, setContext] = useState(readConversationContext);
  useEffect(() => subscribeConversationContext(setContext), []);
  if (!context) return null;
  const kind = context.route.pathname.split("/").filter(Boolean)[0] ?? "Home";
  const fallback = kind === "docs" ? "Document" : kind.charAt(0).toUpperCase() + kind.slice(1);
  const references = conversationContextReferences(context);
  if (references.length === 0) return null;
  const effective = conversationContextForPrompt(context);
  return (
    <div className="flex min-w-0 shrink-0 items-center gap-1.5 overflow-x-auto px-1 text-[var(--t-meta)] text-[var(--text-mid)]" aria-label="Material shared with the next message">
      <span className="shrink-0">Sees</span>
        {references.map((reference) => (
          <span
            key={reference.id}
            className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-[var(--r-pill)] bg-[var(--surface)] px-2 py-1 text-[var(--text)]"
            title={`Sent as a reference with your next message: ${conversationContextRouteLabel(effective)}`}
          >
            <span className="truncate">{referenceLabel(reference, fallback)}</span>
            <button
              type="button"
              aria-label={`Remove ${referenceLabel(reference, fallback)} from the next message`}
              className="shrink-0 rounded-[var(--r-pill)] text-[var(--text-mid)] hover:text-[var(--text)] focus-visible:text-[var(--text)]"
              onClick={() => publishConversationContext(omitConversationContextReference(context, reference.id))}
            >
              <X className="h-3 w-3" strokeWidth={1.6} aria-hidden />
            </button>
          </span>
        ))}
    </div>
  );
}
