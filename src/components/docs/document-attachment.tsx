import { useMutation, useQuery } from '@tanstack/react-query';
import { Control } from '@/components/ui/control';
import { QueryState } from '@/components/ui/query-state';
import { readVaultFile, openVaultFile } from '@/lib/vault';

/** Non-Markdown sources keep their format; opening must never rewrite them. */
export function DocumentAttachment({ path, title, onBack }: { path: string; title: string; onBack: () => void }) {
  const open = useMutation({ mutationFn: () => openVaultFile(path) });
  const isText = /\.(txt|mdx)$/i.test(path);
  const query = useQuery({ queryKey: ['document-attachment', path], queryFn: () => readVaultFile(path), enabled: isText });
  return <div className="flex min-h-0 flex-1 flex-col"><div className="flex flex-wrap items-center gap-3 px-6 py-3"><Control onClick={onBack}>Back</Control><span className="text-[var(--t-meta)] text-[var(--text-muted)]">{isText ? 'Text · Preview' : 'Attachment'}</span>{!isText ? <Control loading={open.isPending} onClick={() => open.mutate()}>Open original</Control> : null}</div>
    <div className="min-h-0 flex-1 overflow-auto px-6 py-7 md:px-10"><>{open.error ? <p role="alert" className="mb-3 text-[var(--bad)]">Could not open the original. {String(open.error)}</p> : null}</><h1 className="mb-6 text-[24px] text-[var(--text)]">{title}</h1>{isText ? <QueryState isLoading={query.isLoading} error={query.error} isEmpty={false} errorTitle="File could not be opened" onRetry={() => void query.refetch()}><pre className="whitespace-pre-wrap break-words font-ui text-[var(--t-body)]">{query.data}</pre></QueryState> : <p className="text-[var(--t-meta)] text-[var(--text-muted)]">Open the original file in its default application. Markdown documents can be edited here.</p>}</div>
  </div>;
}
