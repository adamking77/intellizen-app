import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Control } from "@/components/ui/control";
import { QueryState } from "@/components/ui/query-state";
import { readVaultBinaryFile } from "@/lib/vault";

export function DocumentImage({ path, title, onBack }: { path: string; title: string; onBack: () => void }) {
  const query = useQuery({ queryKey: ["document-image", path], queryFn: () => readVaultBinaryFile(path) });
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!query.data) { setUrl(null); return; }
    const type = /\.png$/i.test(path) ? "image/png" : /\.webp$/i.test(path) ? "image/webp" : "image/jpeg";
    const next = URL.createObjectURL(new Blob([new Uint8Array(query.data)], { type }));
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [query.data, path]);
  return <div className="flex min-h-0 flex-1 flex-col">
    <div className="flex items-center gap-3 border-b border-[var(--border-subtle)] px-6 py-3">
      <Control onClick={onBack}>Back</Control><span className="text-[var(--t-meta)] text-[var(--text-muted)]">Image · Preview</span>
    </div>
    <div className="min-h-0 flex-1 overflow-auto px-6 py-7 md:px-10">
      <h1 className="mb-6 font-ui text-[24px] font-normal text-[var(--text)]">{title}</h1>
      <QueryState isLoading={query.isLoading} error={query.error} isEmpty={false} errorTitle="Image could not be opened" onRetry={() => void query.refetch()}>
        {url ? <img src={url} alt={title} className="h-auto max-w-full" /> : null}
      </QueryState>
    </div>
  </div>;
}
