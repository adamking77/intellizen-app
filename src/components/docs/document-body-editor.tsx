import { lazy, Suspense, useRef, useState } from "react";
import { GraphEmbedPreview } from "./graph-embed";
import { Skeleton } from "@/components/ui/skeleton";
import { splitDocumentEmbeds } from "@/lib/document-editing";

const Editor = lazy(async () => ({ default: (await import("@/components/reports/inline-markdown-editor")).InlineMarkdownEditor }));

export function DocumentBodyEditor({ body, onChange }: { body: string; onChange: (body: string) => void }) {
  const [segments] = useState(() => splitDocumentEmbeds(body));
  const values = useRef(segments.map((segment) => segment.text));
  return <div className="space-y-4">
    {segments.map((segment, index) => segment.graph
      ? <GraphEmbedPreview key={index} spec={segment.graph} />
      : <Suspense key={index} fallback={<Skeleton lines={3} />}><Editor initialValue={segment.text} onChange={(text) => {
          values.current[index] = text;
          onChange(values.current.map((part, i) => i < values.current.length - 1 && !part.endsWith("\n") ? `${part}\n\n` : part).join(""));
        }} /></Suspense>)}
  </div>;
}
