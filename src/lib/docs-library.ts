import { DOCUMENTS_DB_FIELDS, documentDisplayTitle, documentFieldString, humanizeDocumentFilename, isAbsoluteDocumentPath } from './documents';
import type { WorkspaceDatabaseRecordModel } from './types';

export interface VaultDocumentFile { path: string; name: string; modifiedAt?: string; }
export interface VaultDocumentInventory { files: VaultDocumentFile[]; folders: string[]; errors: Array<{ path: string; message: string }>; }
export type DocsView = 'folders' | 'recent' | 'favorites' | 'reports' | 'journals' | 'outputs';

// Explicit vault-root paths coexist with old intelligence-relative record paths.
export function canonicalDocumentPath(raw: string): string | null {
  if (!raw) return null;
  const absolute = /^\/Users\/[^/]+\/vault\/(.+)$/.exec(raw);
  const path = absolute?.[1] ?? (raw.startsWith('vault:') ? raw.slice(6) : isAbsoluteDocumentPath(raw) ? null : `intelligence/${raw}`);
  if (!path || path.includes('\\') || path.split('/').some(s => !s || s === '.' || s === '..')) return null;
  return path;
}
export function recordVaultPath(record: WorkspaceDatabaseRecordModel) {
  return canonicalDocumentPath(documentFieldString(record, DOCUMENTS_DB_FIELDS.vaultPath));
}
export function documentFolderPath(record: WorkspaceDatabaseRecordModel) {
  return recordVaultPath(record)?.split('/').slice(0, -1).join('/') ?? null;
}
const hidden = new Set(['node_modules', 'dist', 'build', 'target', 'tmp', 'supabase', 'scripts', 'state-archive', '.git']);
export function visibleVaultFolder(path: string) {
  const parts = path.split('/');
  return !parts.some(p => p.startsWith('.') || hidden.has(p)) && !/^(shared\/(identity|skills|systems|memory)|session\/intellizen-workflow-drafts)(\/|$)/.test(path);
}
export function visibleVaultFile(path: string) {
  return visibleVaultFolder(path) && (/\.(md|markdown|mdx|txt|png|jpe?g|webp|pdf|html?)$/i.test(path) || !path.split('/').at(-1)?.includes('.'))
    && !/(^|\/)(AGENTS|CLAUDE|SKILL|SOUL|USER)\.md$/i.test(path);
}
export function mergeVaultDocuments(records: WorkspaceDatabaseRecordModel[], inventory?: VaultDocumentInventory): WorkspaceDatabaseRecordModel[] {
  if (!inventory) return records;
  const known = new Map<string, WorkspaceDatabaseRecordModel>();
  for (const record of records) { const path = recordVaultPath(record); if (path && !known.has(path)) known.set(path, record); }
  const result: WorkspaceDatabaseRecordModel[] = records.map(record => {
    const path = recordVaultPath(record);
    return { ...record, _vaultMissing: Boolean(path && !inventory.files.some(file => file.path === path)) };
  });
  for (const file of inventory.files) {
    if (known.has(file.path)) continue;
    result.push({ id: `vault:${file.path}`, _vaultOnly: true, _vaultMissing: false,
      doc_title: humanizeDocumentFilename(file.name), doc_vault_path: `vault:${file.path}`,
      doc_folder: file.path.split('/').slice(0, -1).join('/'), _updatedAt: file.modifiedAt,
    } as WorkspaceDatabaseRecordModel);
  }
  return result;
}
export interface DocumentFolder { path: string; name: string; folders: DocumentFolder[]; records: WorkspaceDatabaseRecordModel[]; count: number; }
export function buildDocumentFolders(records: WorkspaceDatabaseRecordModel[], paths: string[] = []): DocumentFolder {
  const root: DocumentFolder = { path: '', name: 'Vault', folders: [], records: [], count: 0 };
  const nodes = new Map([['', root]]);
  function ensure(path: string): DocumentFolder {
    if (nodes.has(path)) return nodes.get(path)!;
    const parts = path.split('/'); const name = parts.pop()!;
    const parent = ensure(parts.join('/'));
    const node: DocumentFolder = { path, name, folders: [], records: [], count: 0 };
    parent.folders.push(node); nodes.set(path, node); return node;
  }
  paths.filter(visibleVaultFolder).forEach(ensure);
  for (const record of records) { const folder = documentFolderPath(record); if (folder !== null) ensure(folder).records.push(record); }
  function sort(node: DocumentFolder): number {
    node.folders.sort((a, b) => a.name.localeCompare(b.name));
    node.records.sort((a, b) => documentDisplayTitle(a).localeCompare(documentDisplayTitle(b)));
    node.count = node.records.length + node.folders.reduce((n, child) => n + sort(child), 0); return node.count;
  }
  sort(root); return root;
}
export function matchesDocsView(record: WorkspaceDatabaseRecordModel, view: DocsView, favorites: string[]) {
  const path = recordVaultPath(record) ?? '';
  const type = documentFieldString(record, DOCUMENTS_DB_FIELDS.docType);
  if (view === 'favorites') return favorites.includes(record.id);
  if (view === 'reports') return /report|brief|analysis/.test(type) || /(^|\/)(reports?|briefs?|investigations|analysis)(\/|$)/.test(path);
  if (view === 'journals') return /journal|daily-brief/.test(type) || /(^|\/)(journal|journals|session-logs|session_logs|logs|reflections)(\/|$)/.test(path);
  if (view === 'outputs') return /output|deliverable/.test(type) || /(^|\/)(outputs|deliverables|releases)(\/|$)/.test(path);
  return true;
}
