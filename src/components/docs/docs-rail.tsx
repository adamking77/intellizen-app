import { ChevronDown, FileText, Search } from "lucide-react";
import { useState, type PointerEvent } from "react";

import { Control } from "@/components/ui/control";
import { Identity } from "@/components/ui/identity";
import { Input } from "@/components/ui/input";
import { Pill } from "@/components/ui/status-pill";
import { DOCUMENTS_DB_FIELDS, documentDisplayTitle, documentFieldString, documentMatchesSearch } from "@/lib/documents";
import type { WorkspaceDatabaseRecordModel } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface DocsGroup {
  id: string;
  label: string;
  items: WorkspaceDatabaseRecordModel[];
}

export function groupDocuments(
  records: WorkspaceDatabaseRecordModel[],
  projects: Array<{ id: string; name: string }>,
  proposalCounts: Record<string, number>,
): DocsGroup[] {
  const count = (record: WorkspaceDatabaseRecordModel) => proposalCounts[documentFieldString(record, DOCUMENTS_DB_FIELDS.vaultPath)] ?? 0;
  const waiting = records.filter((record) => !record._isTemplate && count(record) > 0);
  const claimed = new Set(waiting.map((record) => record.id));
  const groups: DocsGroup[] = waiting.length ? [{ id: "waiting", label: "Waiting on you", items: waiting }] : [];
  for (const project of projects) {
    const items = records.filter((record) => !record._isTemplate && !claimed.has(record.id) && documentFieldString(record, DOCUMENTS_DB_FIELDS.project) === project.id);
    if (items.length) groups.push({ id: `project:${project.id}`, label: project.name, items });
  }
  const unfiled = records.filter((record) => !record._isTemplate && !claimed.has(record.id) && !projects.some((project) => project.id === documentFieldString(record, DOCUMENTS_DB_FIELDS.project)));
  if (unfiled.length) groups.push({ id: "unfiled", label: "Unfiled", items: unfiled });
  const templates = records.filter((record) => record._isTemplate);
  if (templates.length) groups.push({ id: "templates", label: "Templates", items: templates });
  return groups;
}

export function DocsRail({
  records,
  projects,
  proposalCounts,
  selectedRecordId,
  searchQuery,
  width,
  creating,
  onSearch,
  onSelect,
  onCreate,
  onResize,
}: {
  records: WorkspaceDatabaseRecordModel[];
  projects: Array<{ id: string; name: string }>;
  proposalCounts: Record<string, number>;
  selectedRecordId: string | null;
  searchQuery: string;
  width: number | string;
  creating: boolean;
  onSearch: (value: string) => void;
  onSelect: (id: string) => void;
  onCreate: (template?: WorkspaceDatabaseRecordModel | null) => void;
  onResize: (width: number) => void;
}) {
  const [menu, setMenu] = useState(false);
  const filtered = records.filter((record) => documentMatchesSearch(record, searchQuery));
  const groups = groupDocuments(filtered, projects, proposalCounts);

  const startResize = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const origin = event.clientX;
    const start = event.currentTarget.parentElement?.getBoundingClientRect().width ?? 300;
    const move = (next: globalThis.PointerEvent) => onResize(Math.max(180, Math.min(480, start + next.clientX - origin)));
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  };

  return (
    <aside className="relative flex shrink-0 flex-col bg-[var(--mantle)]" style={{ width }} aria-label="Documents">
      <div className="grid gap-2 p-3">
        <div className="flex h-[var(--h-ctl)] items-center gap-2">
          <span className="text-[var(--t-section)] uppercase tracking-[0.14em] text-[var(--text)]">Docs</span>
          <span className="font-mono text-[11px] text-[var(--text-muted)]">{records.filter((record) => !record._isTemplate).length}</span>
          <div className="flex-1" />
          <div className="relative">
            <Control size="sm" variant="primary" loading={creating} onClick={() => setMenu((open) => !open)} aria-expanded={menu}>New <ChevronDown className="h-3 w-3" /></Control>
            {menu ? (
              <div className="absolute right-0 top-8 z-40 w-64 rounded-[var(--r-plane)] bg-[var(--raised)] p-1.5 shadow-[var(--shadow-elevated)]">
                {records.filter((record) => record._isTemplate).map((template) => <Control key={template.id} variant="quiet" className="w-full justify-start" onClick={() => { setMenu(false); onCreate(template); }}>{documentDisplayTitle(template)}</Control>)}
                <Control variant="quiet" className="w-full justify-start" onClick={() => { setMenu(false); onCreate(null); }}><FileText className="h-3.5 w-3.5" />Quick note</Control>
              </div>
            ) : null}
          </div>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
          <Input value={searchQuery} onChange={(event) => onSearch(event.target.value)} placeholder="Search titles, people, cases" aria-label="Search documents" className="pl-7" />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
        {groups.map((group) => (
          <section key={group.id}>
            <div className={cn("flex h-[var(--h-row)] items-center gap-2 px-2 text-[var(--t-count)] uppercase tracking-[0.12em] text-[var(--text-muted)]", group.id === "waiting" && "text-[var(--wait)]")}><span className="truncate">{group.label}</span><span className="ml-auto font-mono">{group.items.length}</span></div>
            {group.items.map((record) => <DocumentRow key={record.id} record={record} selected={record.id === selectedRecordId} pending={proposalCounts[documentFieldString(record, DOCUMENTS_DB_FIELDS.vaultPath)] ?? 0} onSelect={onSelect} />)}
          </section>
        ))}
        {!groups.length ? <p className="px-2 py-3 text-[var(--t-meta)] text-[var(--text-muted)]">{searchQuery ? "No documents match this search." : "Documents you create will appear here."}</p> : null}
      </div>
      {typeof width === "number" ? <div role="separator" aria-orientation="vertical" aria-label="Resize document list" tabIndex={0} onPointerDown={startResize} onKeyDown={(event) => { if (event.key === "ArrowLeft") onResize(Math.max(180, width - 10)); else if (event.key === "ArrowRight") onResize(Math.min(480, width + 10)); else return; event.preventDefault(); }} className="absolute inset-y-0 right-0 w-1 cursor-col-resize hover:bg-[var(--hover)]" /> : null}
    </aside>
  );
}

function DocumentRow({ record, selected, pending, onSelect }: { record: WorkspaceDatabaseRecordModel; selected: boolean; pending: number; onSelect: (id: string) => void }) {
  const author = documentFieldString(record, DOCUMENTS_DB_FIELDS.author).trim();
  const you = /^(adam|you)$/i.test(author);
  const updated = documentFieldString(record, DOCUMENTS_DB_FIELDS.updatedAt) || String(record._updatedAt ?? "");
  const parsed = Date.parse(updated);
  const date = Number.isFinite(parsed) ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(parsed) : "";
  return (
    <button type="button" onClick={() => onSelect(record.id)} aria-current={selected ? "page" : undefined} className={cn("nav-node mb-px h-[var(--h-row)] w-full px-2", selected && "bg-[var(--selected)] font-medium text-[var(--text)]")}>
      <span className="min-w-0 flex-1 truncate text-left">{documentDisplayTitle(record)}</span>
      {pending ? <Pill variant="waiting">{pending} {pending === 1 ? "hunk" : "hunks"}</Pill> : author ? <Identity name={you ? "you" : author} kind={you ? "you" : "hermes"} className="max-w-24" /> : date ? <span className="font-mono text-[11px] text-[var(--text-muted)]">{date}</span> : null}
      {selected ? <span aria-hidden>›</span> : null}
    </button>
  );
}
