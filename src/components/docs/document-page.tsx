import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { DocumentHeader } from "./document-header";
import { DocumentBodyEditor } from "./document-body-editor";
import { DocumentAttachment } from "./document-attachment";
import { documentFolderPath, canonicalDocumentPath } from "@/lib/docs-library";
import { DocumentImage } from "./document-image";
import { DocumentDock } from "./document-dock";
import { Control } from "@/components/ui/control";
import { Drawer } from "@/components/ui/drawer";
import { MarkdownBody } from "@/components/ui/markdown-body";
import { QueryState } from "@/components/ui/query-state";
import { Select } from "@/components/ui/select";
import { documentAttachmentLabel, documentDisplayTitle, documentFieldString, documentVaultRelativePath, DOCUMENTS_DB_FIELDS } from "@/lib/documents";
import { composeDocument, documentPage } from "@/lib/document-editing";
import { DocumentSaveSession, documentSaveSessions } from "@/lib/document-save-session";
import { getWorkspaceRecord, listRecordRevisions, updateWorkspaceRecord, listAllVaultFiles, updateVaultFileContent } from "@/lib/data";
import { readVaultFile, writeVaultFile } from "@/lib/vault";
import { getWorkflowSource } from "@/lib/workflow-source";
import type { WorkflowTemplateItem, WorkspaceDatabaseRecordModel } from "@/lib/types";
import { useProposals } from "@/proposals/use-proposals";
import { useRegisterDocumentProposal, type DocumentProposalDecision } from "@/proposals/document-review-context";
import { SHELL_COMMAND_EVENT, type ShellCommand } from "@/components/layout/command-palette";
import type { Proposal } from "@/proposals/types";

const NO_PROPOSALS: Proposal[] = [];
const FOCUS_MODE_CHANGE_EVENT = "intelizen:focus-mode-change";

interface Props {
  record: WorkspaceDatabaseRecordModel;
  workflow?: WorkflowTemplateItem;
  projects: Array<{ id: string; name: string }>;
  initialEdit: boolean;
  isCramped: boolean;
  savingTemplate: boolean;
  onBack: () => void;
  onReturnToList?: () => void;
  onSaveTemplate: () => void;
  onDelete: () => void;
  onMakeRunnable: () => void;
}

export function DocumentPage(props: Props) {
  const path = documentVaultRelativePath(props.record);
  if (!props.workflow && path && /\.(png|jpe?g|webp)$/i.test(path)) {
    return <DocumentImage path={path} title={documentDisplayTitle(props.record)} onBack={props.onBack} />;
  }
  if (!props.workflow && path && /\.[^/.]+$/.test(path) && !/\.(md|markdown)$/i.test(path)) return <DocumentAttachment path={path} title={documentDisplayTitle(props.record)} onBack={props.onBack} />;
  return <TextDocumentPage {...props} />;
}

function TextDocumentPage(props: Props) {
  const { record, workflow } = props;
  const path = documentVaultRelativePath(record);
  const query = useQuery({
    queryKey: ["document-page", record.id, path],
    queryFn: async () => {
      if (workflow) { const source = await getWorkflowSource(workflow); return { raw: source.content, inVault: false, source }; }
      if (path) { try { return { raw: await readVaultFile(path), inVault: true, source: null }; } catch { /* Load the recoverable workspace copy. */ } }
      if (record._vaultOnly) throw new Error("The vault file could not be read. Refresh folders and try again.");
      const fresh = await getWorkspaceRecord(record.id);
      if (path && !fresh.body?.trim()) throw new Error("The source file is unavailable and no saved document copy was found. The document record has been preserved.");
      return { raw: fresh.body ?? "", inVault: false, source: null };
    },
    refetchOnWindowFocus: false,
    staleTime: 0,
  });
  const [opened, setOpened] = useState(false);
  useEffect(() => { if (query.data && !query.isFetching) setOpened(true); }, [query.data, query.isFetching]);
  if (!query.data && query.error) return <div className="flex min-h-0 flex-1 flex-col"><div className="px-6 py-3"><Control onClick={props.onReturnToList ?? props.onBack}>Back to document list</Control></div><QueryState className="p-6" isLoading={false} error={query.error} isEmpty={false} errorTitle="Document could not be opened" onRetry={() => void query.refetch()}>{null}</QueryState></div>;
  return <QueryState isLoading={query.isLoading || (!opened && query.isFetching)} error={query.data ? undefined : query.error} isEmpty={false} errorTitle="Document could not be opened" onRetry={() => void query.refetch()}>
    {query.data && query.error ? <p role="alert" className="px-6 py-2 text-[var(--bad)]">Could not refresh this document. The open draft is preserved. <Control onClick={() => void query.refetch()}>Retry</Control></p> : null}
    {query.data && (opened || !query.isFetching) ? <LoadedDocument {...props} key={record.id} loaded={query.data} /> : null}
  </QueryState>;
}

function LoadedDocument({ record, workflow, projects, initialEdit, isCramped, savingTemplate, onBack, onSaveTemplate, onDelete, onMakeRunnable, loaded }: Props & {
  loaded: { raw: string; inVault: boolean; source: Awaited<ReturnType<typeof getWorkflowSource>> | null };
}) {
  const client = useQueryClient();
  const path = documentVaultRelativePath(record);
  const [mode, setMode] = useState<"read" | "edit">(initialEdit && !workflow ? "edit" : "read");
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [readingFocus, setReadingFocus] = useState(() => {
    if (typeof window === "undefined") return false;
    try { return window.localStorage.getItem("intelizen:focus-mode") === "1"; }
    catch { return false; }
  });
  const [history, setHistory] = useState(false);
  const [editorVersion, setEditorVersion] = useState(0);
  const [inVault, setInVault] = useState(loaded.inVault);
  const [filing, setFiling] = useState(false);
  const [filingError, setFilingError] = useState<string | null>(null);
  const [session] = useState(() => {
    const existing = documentSaveSessions.get(record.id);
    if (existing && ["dirty", "saving", "error"].includes(existing.getSnapshot().status)) return existing;
    const key = `intelizen:document-draft:${record.id}`;
    let recovered: string | null = null;
    try { recovered = localStorage.getItem(key); } catch { /* Session remains usable when storage is unavailable. */ }
    let diskBaseline = loaded.inVault ? loaded.raw : null;
    const next = new DocumentSaveSession({ initial: loaded.raw, recovered,
      storeDraft: (text) => { try { if (text === null) localStorage.removeItem(key); else localStorage.setItem(key, text); } catch { /* Visible save state remains authoritative. */ } },
      save: async (text) => {
        if (path) {
          const current = await readVaultFile(path);
          if (diskBaseline !== null && current !== diskBaseline && current !== text) throw new Error("This file changed outside the editor. Your draft is preserved; reopen after reconciling the versions.");
          await writeVaultFile(path, text); diskBaseline = text;
        }
        if (!record._vaultOnly) {
        const fresh = await getWorkspaceRecord(record.id);
        await updateWorkspaceRecord(record.id, { body: text, fields: { ...fresh.fields, [DOCUMENTS_DB_FIELDS.title]: documentPage(text, documentDisplayTitle(record)).title, [DOCUMENTS_DB_FIELDS.updatedAt]: new Date().toISOString() } });
        if (path) {
          const mirrors = (await listAllVaultFiles()).filter((file) => canonicalDocumentPath(file.file_path) === canonicalDocumentPath(path));
          await Promise.all(mirrors.map((mirror) => updateVaultFileContent(mirror.id, text)));
        }
        }
        client.setQueryData(["document-page", record.id, path], { raw: text, inVault: Boolean(path), source: null });
        await client.invalidateQueries({ queryKey: ["docs-workspace-bundle"] });
        void client.invalidateQueries({ queryKey: ["docs-vault-inventory"] });
      },
    });
    documentSaveSessions.set(record.id, next);
    return next;
  });
  const draft = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const page = documentPage(draft.text, documentDisplayTitle(record));
  const [editingTitle, setEditingTitle] = useState(page.title);
  useEffect(() => { if (mode === "read") setEditingTitle(page.title); }, [mode, page.title]);
  const projectId = documentFieldString(record, DOCUMENTS_DB_FIELDS.project);
  const updated = documentFieldString(record, DOCUMENTS_DB_FIELDS.updatedAt) || String(record._updatedAt ?? "");
  const updatedDate = Number.isFinite(Date.parse(updated)) ? new Date(updated).toLocaleDateString("en", { month: "short", day: "numeric" }) : "";
  const attachment = documentAttachmentLabel(record);
  const project = projects.find((item) => item.id === projectId);
  const revisions = useQuery({ queryKey: ["document-history", record.id], queryFn: () => listRecordRevisions(record.id), enabled: history });
  const [revisionId, setRevisionId] = useState<string | null>(null);
  const revision = revisions.data?.find((item) => item.id === revisionId);
  const { proposals, accept: acceptProposal, busy: proposalBusy, error: proposalError } = useProposals(workflow ? null : path);
  const listedProposals = proposals ?? NO_PROPOSALS;
  const proposalCount = listedProposals.reduce((sum, proposal) => sum + proposal.hunks.length, 0);

  useEffect(() => { session.adopt(loaded.raw); }, [session, loaded.raw]);
  useEffect(() => () => { if (!workflow) void session.flush(); }, [session, workflow]);
  useEffect(() => { if (draft.status === "saved" && path) setInVault(true); }, [draft.status, path]);
  useEffect(() => {
    const changed = (event: Event) => setReadingFocus(Boolean((event as CustomEvent<boolean>).detail));
    window.addEventListener(FOCUS_MODE_CHANGE_EVENT, changed);
    return () => window.removeEventListener(FOCUS_MODE_CHANGE_EVENT, changed);
  }, []);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.metaKey && event.key.toLowerCase() === "e" && !workflow && !decisionBusy) { event.preventDefault(); setMode((old) => old === "edit" ? "read" : "edit"); }
      if (event.metaKey && event.key.toLowerCase() === "s" && !workflow) { event.preventDefault(); void session.flush(); }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [session, workflow, decisionBusy]);

  const edit = (title: string, body: string) => {
    const text = record._vaultOnly
      ? `${/^---\r?\n[\s\S]*?\r?\n---\r?\n*/.exec(draft.text)?.[0] ?? ""}# ${title || "Untitled document"}\n\n${body}`
      : composeDocument(draft.text, title, body, record.id);
    session.edit(text);
  };
  const decideProposal = useCallback(async (decision: DocumentProposalDecision) => {
    if (decision.documentId !== record.id || decision.docPath !== path) throw new Error("The open document changed. Review the current proposal before deciding.");
    const proposal = listedProposals.find((item) => item.id === decision.proposalId);
    if (!proposal) throw new Error("That proposal is no longer waiting. Review the current suggestions.");
    const selected = [...decision.taken, ...decision.dropped];
    const keys = selected.map((hunk) => JSON.stringify([hunk.id, hunk.at, hunk.old, hunk.new]));
    const available = new Set(proposal.hunks.map((hunk) => JSON.stringify([hunk.id, hunk.at, hunk.old, hunk.new])));
    if (selected.length === 0 || new Set(keys).size !== keys.length || keys.some((key) => !available.has(key))) {
      throw new Error("Those suggested edits changed. Review the current proposal before deciding.");
    }
    setDecisionBusy(true);
    try {
      await session.flush();
      if (session.getSnapshot().status === "error") throw new Error("Save the current draft before deciding on suggested edits.");
      const text = await acceptProposal(proposal.id, decision.taken, decision.dropped);
      if (text !== null) {
        session.edit(text);
        setEditorVersion((version) => version + 1);
      }
    } finally {
      setDecisionBusy(false);
    }
  }, [path, listedProposals, record.id, session, acceptProposal]);
  const proposalRegistration = useMemo(() => path && (listedProposals.length || proposalError) ? {
    review: {
      documentId: record.id,
      docPath: path,
      title: page.title,
      proposals: listedProposals,
      busy: decisionBusy || proposalBusy,
      error: proposalError,
    },
    decide: decideProposal,
  } : null, [path, listedProposals, proposalBusy, proposalError, record.id, page.title, decisionBusy, decideProposal]);
  useRegisterDocumentProposal(record.id, proposalRegistration);
  const sectionCount = Math.max(1, page.body.split("\n").filter((line) => /^#{1,6}\s/.test(line)).length);
  const wordCount = page.body.trim() ? page.body.trim().split(/\s+/).length : 0;
  const changeMode = (next: "read" | "edit") => {
    if (workflow || decisionBusy) return;
    setMode(next);
  };
  const toggleReadingFocus = () => {
    const next = !readingFocus;
    setReadingFocus(next);
    window.dispatchEvent(new CustomEvent<ShellCommand>(SHELL_COMMAND_EVENT, { detail: "focus-mode" }));
  };
  const proposalLabel = proposals === null
    ? "Suggestions unavailable"
    : proposalCount > 0
      ? `${proposalCount} suggestion${proposalCount === 1 ? "" : "s"} in the panel`
      : "No suggestions waiting";
  return <div className="relative flex min-h-0 flex-1 flex-col">
    {!readingFocus ? <DocumentHeader decisionBusy={decisionBusy} breadcrumb={`Docs / ${documentFolderPath(record) ?? "Saved in workspace"}`} localOnly={Boolean(record._vaultOnly)} mode={mode} saveStatus={draft.status} inVault={inVault} isTemplate={Boolean(record._isTemplate)} isCramped={isCramped} savingTemplate={savingTemplate} readOnly={Boolean(workflow)} onBack={onBack} onModeChange={changeMode} onRetry={() => void session.flush()} onSaveTemplate={onSaveTemplate} onMakeRunnable={onMakeRunnable} onDelete={onDelete} onHistory={() => setHistory(true)} onFile={() => setFiling((open) => !open)} /> : null}
    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-7 md:px-10">
      <article className="mx-auto max-w-[65ch]">
        {mode === "edit" ? <input aria-label="Document title" autoFocus={initialEdit} value={editingTitle} onChange={(event) => { setEditingTitle(event.target.value); edit(event.target.value, page.body); }} className="w-full bg-transparent font-ui text-[24px] font-normal leading-tight text-[var(--text)] outline-none" /> : <h1 className="font-ui text-[24px] font-normal leading-tight text-[var(--text)]">{page.title}</h1>}
        <p className="mt-2 font-mono text-[10px] leading-relaxed text-[var(--text-muted)]">Verification unavailable · Completion criteria not recorded · {proposalLabel}</p>
        <p className="mb-6 mt-2 text-[length:var(--t-meta)] text-[var(--text-muted)]">{workflow ? `Maintained by ${workflow.owner_role || "the workflow owner"}` : documentFieldString(record, DOCUMENTS_DB_FIELDS.author) ? `${/^(adam|you)$/i.test(documentFieldString(record, DOCUMENTS_DB_FIELDS.author)) ? "You" : documentFieldString(record, DOCUMENTS_DB_FIELDS.author)} wrote it` : "Document"}{updatedDate ? ` · Updated ${updatedDate}` : ""}{project || attachment ? ` · linked to ${project?.name || attachment}` : ""}</p>
        {filing && !workflow ? <div className="mb-5"><Select aria-label="Document project" value={projectId} onChange={async (event) => {
          try { setFilingError(null); await updateWorkspaceRecord(record.id, { fieldId: DOCUMENTS_DB_FIELDS.project, value: event.target.value || null }); await client.invalidateQueries({ queryKey: ["docs-workspace-bundle"] }); setFiling(false); } catch (error) { setFilingError(String(error)); }
        }}><option value="">Unfiled</option>{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select>{filingError ? <p role="alert">{filingError}</p> : null}</div> : null}
        {draft.error ? <div role="alert" className="mb-5 text-[var(--bad)]">Could not save. Your draft is kept on this Mac. {draft.error} <Control onClick={() => void session.flush()}>Retry save</Control></div> : null}
        {loaded.source?.warning ? <p role="status" className="mb-4 text-[var(--wait)]">{loaded.source.warning}</p> : null}
        {mode === "edit" ? <DocumentBodyEditor key={editorVersion} body={page.body} onChange={(body) => edit(editingTitle, body)} /> : <MarkdownBody content={page.body} vaultPath={loaded.source?.sourcePath || path} />}
        {loaded.source ? <Link to={loaded.source.recordHref} className="mt-6 inline-block text-[length:var(--t-meta)] text-[var(--accent-text)]">Open source record</Link> : null}
      </article>
    </div>
    <DocumentDock mode={mode} onModeChange={changeMode} positionLabel={`${sectionCount} section${sectionCount === 1 ? "" : "s"} · ${wordCount.toLocaleString()} words`} readingFocus={readingFocus} onReadingFocus={toggleReadingFocus} proposalCount={proposalCount} readOnly={Boolean(workflow)} decisionBusy={decisionBusy} />
    <Drawer open={history} onClose={() => setHistory(false)} label="Document history" className="max-w-[calc(100%-16px)]">
      <div className="p-4"><div className="mb-4 flex items-center justify-between"><span>History</span><Control onClick={() => setHistory(false)}>Close</Control></div>
        <QueryState isLoading={revisions.isLoading} error={revisions.error} isEmpty={!revisions.data?.length} emptyTitle="No earlier revisions" emptyDescription="This document has no earlier saved version." onRetry={() => void revisions.refetch()}>
          {revisions.data?.map((item) => <Control key={item.id} variant={revisionId === item.id ? "selected" : "quiet"} className="mb-1 w-full justify-start" onClick={() => setRevisionId(item.id)}>{new Date(item.revised_at).toLocaleString()}</Control>)}
          {revision ? <MarkdownBody content={revision.body ?? ""} /> : null}
        </QueryState>
      </div>
    </Drawer>
  </div>;
}
