import { Control } from "@/components/ui/control";
import { Identity } from "@/components/ui/identity";
import { Receipt } from "@/components/ui/receipt";
import { Pill } from "@/components/ui/status-pill";
import { DOCUMENTS_DB_FIELDS } from "@/lib/documents";
import type { ProjectLinkedRecord } from "@/lib/project-room";
import type { IntelEntity, Investigation, InvestigationSignal, WorkspaceDatabaseRecord } from "@/lib/types";
import { runViewTransition } from "@/lib/view-transitions";
import type { ProjectFile } from "@/services/project-files";

const CASE_STAGES = ["Brief", "Collect", "Analyse", "Report", "Close"];

function text(record: WorkspaceDatabaseRecord, field: string) {
  const value = record.fields[field];
  return typeof value === "string" ? value : "";
}

function title(record: WorkspaceDatabaseRecord) {
  return text(record, DOCUMENTS_DB_FIELDS.title).trim() || "Untitled document";
}

function date(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? ""
    : new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(parsed);
}

function Attribution({ name }: { name: string }) {
  const you = /^(adam|you)$/i.test(name);
  return <Identity name={you ? "you" : name} kind={you ? "you" : undefined} />;
}

export function ProjectBrief({
  clientCase,
  files,
  linkedRecords,
  graphCount,
  investigation,
}: {
  clientCase: boolean;
  files: WorkspaceDatabaseRecord[];
  linkedRecords: ProjectLinkedRecord[];
  graphCount: number | null;
  investigation: Investigation | null;
}) {
  const phase = Math.max(1, Math.min(5, investigation?.current_phase ?? 1));
  const latest = [...files].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
  const author = latest ? text(latest, DOCUMENTS_DB_FIELDS.author).trim() : "";
  const opened = investigation?.created_at ? date(investigation.created_at) : "";

  return (
    <div className="mx-auto grid w-full max-w-4xl gap-5 px-5 py-4">
      <div className="text-[var(--t-count)] uppercase tracking-[0.14em] text-[var(--text-muted)]">
        {clientCase ? `Client case${opened ? ` · opened ${opened}` : ""}` : "Project"}
      </div>
      {clientCase ? (
        <ol className="flex flex-wrap gap-1.5" aria-label="Case stage">
          {CASE_STAGES.map((stage, index) => {
            const step = index + 1;
            return (
              <li
                key={stage}
                className={`flex h-[var(--h-ctl)] items-center gap-2 rounded-[var(--r-ctl)] px-2.5 text-[var(--t-meta)] ${step === phase ? "bg-[var(--selected)] font-medium text-[var(--text)]" : "bg-[var(--raised)] text-[var(--text-muted)]"}`}
              >
                <span className="font-mono text-[11px]">{step}</span>
                <span>{stage}</span>
                {step < phase ? <span aria-label="complete">✓</span> : step === phase ? <span className="text-[var(--wait)]">now</span> : null}
              </li>
            );
          })}
        </ol>
      ) : null}
      <dl className="grid gap-px overflow-hidden rounded-[var(--r-ctl)] bg-[var(--hair)]">
        {clientCase ? (
          <>
            <BriefLine term="Subject">{investigation?.subject_definition || "—"}</BriefLine>
            <BriefLine term="Scope">{investigation?.investigation_scope || investigation?.scope_notes || "—"}</BriefLine>
            <BriefLine term="Hypotheses">{investigation?.known_hypotheses?.length ? investigation.known_hypotheses.join(" · ") : "—"}</BriefLine>
            <BriefLine term="Notes">{investigation?.scope_notes || "—"}</BriefLine>
          </>
        ) : null}
        <BriefLine term="Latest document by">
          {author ? <Attribution name={author} /> : "—"}
        </BriefLine>
        <BriefLine term="Evidence">{linkedRecords.length} records · {files.length} documents · {graphCount === null ? "Entities unavailable" : `${graphCount} entities`}</BriefLine>
        <BriefLine term="Last movement">
          {latest ? <Receipt className="ml-0" verb="wrote" object={`${title(latest)} · ${date(latest.updated_at)}`} /> : "—"}
        </BriefLine>
        <BriefLine term="Next">No next action recorded</BriefLine>
        <BriefLine term="Files">{files.length ? files.slice(0, 4).map(title).join(" · ") + (files.length > 4 ? ` · +${files.length - 4}` : "") : "—"}</BriefLine>
      </dl>
    </div>
  );
}

function BriefLine({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-[var(--h-line)] grid-cols-[140px_minmax(0,1fr)] items-center gap-3 bg-[var(--base)] px-3 py-2">
      <dt className="text-[var(--t-count)] uppercase tracking-[0.12em] text-[var(--text-muted)]">{term}</dt>
      <dd className="min-w-0 text-[var(--t-meta)] text-[var(--text)]">{children}</dd>
    </div>
  );
}

export function ProjectEvidenceTable({
  files,
  folderFiles,
  linkedRecords,
  signals = [],
  onOpenDocument,
  onOpenFile,
  onOpenRecord,
  onOpenSignal,
}: {
  files: WorkspaceDatabaseRecord[];
  folderFiles?: ProjectFile[];
  linkedRecords: ProjectLinkedRecord[];
  signals?: InvestigationSignal[];
  onOpenDocument: (record: WorkspaceDatabaseRecord) => void;
  onOpenFile?: (file: ProjectFile) => void;
  onOpenRecord: (record: ProjectLinkedRecord) => void;
  onOpenSignal?: (signal: InvestigationSignal) => void;
}) {
  return (
    <div className="px-5 py-4">
      <div role="table" aria-label="Project evidence" className="overflow-hidden rounded-[var(--r-ctl)] bg-[var(--raised)]">
        <div role="row" className="grid h-[var(--h-line)] grid-cols-[minmax(0,1fr)_140px_110px_110px] items-center gap-3 px-3 text-[var(--t-count)] uppercase tracking-[0.12em] text-[var(--text-muted)]">
          <span role="columnheader">Evidence</span><span role="columnheader">Runs as</span><span role="columnheader">State</span><span role="columnheader">Updated</span>
        </div>
        {files.map((file) => {
          const author = text(file, DOCUMENTS_DB_FIELDS.author).trim();
          return (
            <button key={file.id} type="button" role="row" onClick={(event) => runViewTransition("drawer", () => onOpenDocument(file), event.currentTarget)} className="grid h-[var(--h-line)] w-full grid-cols-[minmax(0,1fr)_140px_110px_110px] items-center gap-3 px-3 text-left hover:bg-[var(--hover)]">
              <span role="cell" className="truncate text-[var(--t-ui)] text-[var(--text)]">{title(file)}</span>
              <span role="cell">{author ? <Attribution name={author} /> : "—"}</span>
              <span role="cell"><Pill>{text(file, DOCUMENTS_DB_FIELDS.stage) || "document"}</Pill></span>
              <span role="cell" className="font-mono text-[11px] text-[var(--text-muted)]">{date(file.updated_at)}</span>
            </button>
          );
        })}
        {linkedRecords.map((record) => (
          <button key={`${record.databaseId}:${record.recordId}`} type="button" role="row" onClick={(event) => runViewTransition("drawer", () => onOpenRecord(record), event.currentTarget)} className="grid h-[var(--h-line)] w-full grid-cols-[minmax(0,1fr)_140px_110px_110px] items-center gap-3 px-3 text-left hover:bg-[var(--hover)]">
            <span role="cell" className="truncate text-[var(--t-ui)] text-[var(--text)]">{record.title}</span>
            <span role="cell">—</span>
            <span role="cell">{record.status ? <Pill>{record.status}</Pill> : "—"}</span>
            <span role="cell" className="text-[var(--t-meta)] text-[var(--text-muted)]">{record.databaseName}</span>
          </button>
        ))}
        {signals.map((signal) => (
          <button key={`signal:${signal.id}`} type="button" role="row" onClick={(event) => runViewTransition("drawer", () => onOpenSignal?.(signal), event.currentTarget)} className="grid h-[var(--h-line)] w-full grid-cols-[minmax(0,1fr)_140px_110px_110px] items-center gap-3 px-3 text-left hover:bg-[var(--hover)]">
            <span role="cell" className="truncate text-[var(--t-ui)] text-[var(--text)]">{signal.intel_signals?.title || "Untitled signal"}</span>
            <span role="cell" className="truncate text-[var(--t-meta)] text-[var(--text-muted)]">{signal.intel_signals?.source || "—"}</span>
            <span role="cell"><Pill>signal</Pill></span>
            <span role="cell" className="font-mono text-[11px] text-[var(--text-muted)]">{signal.intel_signals?.updated_at ? date(signal.intel_signals.updated_at) : "—"}</span>
          </button>
        ))}
        {(folderFiles ?? []).map((file) => (
          <button key={file.id} type="button" role="row" onClick={(event) => runViewTransition("drawer", () => onOpenFile?.(file), event.currentTarget)} className="grid h-[var(--h-line)] w-full grid-cols-[minmax(0,1fr)_140px_110px_110px] items-center gap-3 px-3 text-left hover:bg-[var(--hover)]">
            <span role="cell" className="truncate text-[var(--t-ui)] text-[var(--text)]">{file.title}</span>
            <span role="cell" className="truncate font-mono text-[11px] text-[var(--text-muted)]">{file.folder.split("/").pop() || "folder"}</span>
            <span role="cell"><Pill>file</Pill></span>
            <span role="cell" className="font-mono text-[11px] text-[var(--text-muted)]">{file.updatedAt ? date(new Date(file.updatedAt).toISOString()) : "—"}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function ProjectEntities({ entities, onOpen }: { entities: IntelEntity[]; onOpen: (entity: IntelEntity) => void }) {
  return (
    <div className="px-5 py-4">
      <div role="table" aria-label="Case entities" className="overflow-hidden rounded-[var(--r-ctl)] bg-[var(--raised)]">
        <div role="row" className="grid h-[var(--h-line)] grid-cols-[minmax(0,1fr)_150px_120px_110px] items-center gap-3 px-3 text-[var(--t-count)] uppercase tracking-[0.12em] text-[var(--text-muted)]">
          <span role="columnheader">Entity</span><span role="columnheader">Type</span><span role="columnheader">Confidence</span><span role="columnheader">Updated</span>
        </div>
        {entities.map((entity) => (
          <button key={entity.id} type="button" role="row" onClick={(event) => runViewTransition("drawer", () => onOpen(entity), event.currentTarget)} className="grid h-[var(--h-line)] w-full grid-cols-[minmax(0,1fr)_150px_120px_110px] items-center gap-3 px-3 text-left hover:bg-[var(--hover)]">
            <span role="cell" className="truncate text-[var(--t-ui)] text-[var(--text)]">{entity.name}</span>
            <span role="cell" className="capitalize text-[var(--t-meta)] text-[var(--text-muted)]">{entity.entity_type}</span>
            <span role="cell">{entity.confidence ? <Pill>{entity.confidence}</Pill> : "—"}</span>
            <span role="cell" className="font-mono text-[11px] text-[var(--text-muted)]">{date(entity.updated_at)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function ProjectTimeline({ files, investigation, onOpenDocument }: { files: WorkspaceDatabaseRecord[]; investigation: Investigation | null; onOpenDocument: (record: WorkspaceDatabaseRecord) => void }) {
  const events = [
    ...(investigation ? [{ id: `case:${investigation.id}`, at: investigation.created_at, label: "Case opened", file: null }] : []),
    ...files.map((file) => ({ id: file.id, at: file.updated_at, label: title(file), file })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="mx-auto grid max-w-3xl gap-px px-5 py-4">
      {events.map((event) => event.file ? (
        <button key={event.id} type="button" onClick={(click) => runViewTransition("drawer", () => onOpenDocument(event.file!), click.currentTarget)} className="grid min-h-[var(--h-line)] grid-cols-[110px_1fr_auto] items-center gap-3 rounded-[var(--r-ctl)] px-3 text-left hover:bg-[var(--hover)]">
          <span className="font-mono text-[11px] text-[var(--text-muted)]">{date(event.at)}</span>
          <span className="truncate text-[var(--t-ui)] text-[var(--text)]">{event.label}</span>
          <Pill>document</Pill>
        </button>
      ) : (
        <div key={event.id} className="grid min-h-[var(--h-line)] grid-cols-[110px_1fr_auto] items-center gap-3 px-3">
          <span className="font-mono text-[11px] text-[var(--text-muted)]">{date(event.at)}</span>
          <span className="text-[var(--t-ui)] text-[var(--text)]">{event.label}</span>
          <Pill>case</Pill>
        </div>
      ))}
      {!events.length ? <p className="text-[var(--t-ui)] text-[var(--text-muted)]">Case and document movement will appear here.</p> : null}
    </div>
  );
}

export function DrawerActions({ onOpen }: { onOpen: () => void }) {
  return <Control variant="primary" onClick={onOpen}>Open</Control>;
}
