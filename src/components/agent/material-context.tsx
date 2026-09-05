import { useEffect, useState } from "react";
import { conversationContextRouteLabel, readConversationContext, subscribeConversationContext } from "@/lib/conversation-context";

/** The reference sent with the next turn, shared with the ejected panel. */
export function MaterialContext() {
  const [context, setContext] = useState(readConversationContext);
  useEffect(() => subscribeConversationContext(setContext), []);
  if (!context) return null;
  const selection = context.selections[0];
  const kind = context.route.pathname.split("/").filter(Boolean)[0] ?? "Home";
  const label = selection?.label ?? context.label ?? (kind === "docs" ? "Document" : kind === "workflows" && context.route.search.includes("run=") ? "Workflow run" : kind.charAt(0).toUpperCase() + kind.slice(1));
  return (
    <div className="flex min-w-0 shrink-0 items-baseline gap-2 px-1 text-[var(--t-meta)] text-[var(--text-muted)]" title={`Sent as a reference with your next message: ${conversationContextRouteLabel(context)}`}>
      <span className="shrink-0">Context</span>
      <span className="truncate text-[var(--text)]">{label}</span>
    </div>
  );
}
