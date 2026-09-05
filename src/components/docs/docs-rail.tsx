import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { ChevronDown, ChevronRight, FilePlus, Folder, FolderOpen, FolderPlus, RefreshCw, Search, Star } from 'lucide-react';
import { Control } from '@/components/ui/control';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { documentDisplayTitle, documentFieldString, documentMatchesSearch, DOCUMENTS_DB_FIELDS } from '@/lib/documents';
import { buildDocumentFolders, matchesDocsView, recordVaultPath, type DocsView, type DocumentFolder, type VaultDocumentInventory } from '@/lib/docs-library';
import type { WorkspaceDatabaseRecordModel } from '@/lib/types';
import { cn } from '@/lib/utils';

function savedList(key: string): string[] { try { const value = JSON.parse(localStorage.getItem(key) ?? '[]'); return Array.isArray(value) ? value.filter(x => typeof x === 'string') : []; } catch { return []; } }
export function DocsRail({ records, proposalCounts, selectedRecordId, searchQuery, width, creating, inventory, loadingVault, vaultError, workspaceError, activeFolder, onFolder, onRefresh, onSearch, onSelect, onCreate, onCreateFolder, onResize }: {
  records: WorkspaceDatabaseRecordModel[];
  projects: Array<{ id: string; name: string }>;
  proposalCounts: Record<string, number>;
  selectedRecordId: string | null; searchQuery: string; width: number | string; creating: boolean;
  inventory?: VaultDocumentInventory; loadingVault?: boolean; vaultError?: unknown; workspaceError?: unknown;
  activeFolder: string; onFolder: (path: string) => void; onRefresh: () => void;
  onSearch: (value: string) => void; onSelect: (id: string) => void;
  onCreate: (template?: WorkspaceDatabaseRecordModel | null) => void;
  onCreateFolder: (name: string) => Promise<void>; onResize: (width: number) => void;
}) {
  const [menu, setMenu] = useState(false);
  const [view, setView] = useState<DocsView>('folders');
  const [expanded, setExpanded] = useState<string[]>(() => savedList('intelizen:docs-folders'));
  const [favorites, setFavorites] = useState<string[]>(() => savedList('intelizen:docs-favorites'));
  const [newFolder, setNewFolder] = useState<string | null>(null);
  const [folderError, setFolderError] = useState<string | null>(null);
  const [folderBusy, setFolderBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => { try { localStorage.setItem('intelizen:docs-folders', JSON.stringify(expanded)); } catch { /* Mounted state survives. */ } }, [expanded]);
  useEffect(() => { try { localStorage.setItem('intelizen:docs-favorites', JSON.stringify(favorites)); } catch { /* Mounted state survives. */ } }, [favorites]);
  useEffect(() => {
    if (!menu) return;
    const close = (event: MouseEvent) => { if (!menuRef.current?.contains(event.target as Node)) setMenu(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setMenu(false); menuRef.current?.querySelector('button')?.focus(); } };
    window.addEventListener('mousedown', close); window.addEventListener('keydown', escape);
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', escape); };
  }, [menu]);
  useEffect(() => {
    const selected = records.find(record => record.id === selectedRecordId);
    const path = selected && recordVaultPath(selected);
    if (!path) return;
    const parts = path.split('/').slice(0, -1);
    setExpanded(current => [...new Set([...current, ...parts.map((_, index) => parts.slice(0, index + 1).join('/'))])]);
  }, [selectedRecordId]);
  const filtered = records.filter(record => documentMatchesSearch(record, searchQuery) && matchesDocsView(record, view, favorites));
  const tree = buildDocumentFolders(filtered.filter(record => !record._isTemplate), view !== 'folders' ? [] : searchQuery ? inventory?.folders.filter(path => path.toLocaleLowerCase().includes(searchQuery.trim().toLocaleLowerCase())) : inventory?.folders);
  const remote = filtered.filter(record => !recordVaultPath(record) && !record._isTemplate);
  const templates = filtered.filter(record => record._isTemplate);
  const quickResults = [...filtered].sort((a, b) => String(b._updatedAt ?? b.doc_updated_at ?? '').localeCompare(String(a._updatedAt ?? a.doc_updated_at ?? ''))).slice(0, view === 'recent' && !searchQuery ? 40 : undefined);
  const toggle = (path: string) => { onFolder(path); setExpanded(current => current.includes(path) ? current.filter(p => p !== path) : [...current, path]); };
  const favorite = (id: string) => setFavorites(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  const row = (record: WorkspaceDatabaseRecordModel, level = 0, showPath = false) => <DocumentRow key={record.id} record={record} level={level} showPath={showPath} selected={record.id === selectedRecordId} favorite={favorites.includes(record.id)} onFavorite={favorite} pending={proposalCounts[documentFieldString(record, DOCUMENTS_DB_FIELDS.vaultPath)] ?? 0} onSelect={onSelect} />;
  function folder(node: DocumentFolder, level = 0) {
    const open = searchQuery.trim() ? true : expanded.includes(node.path);
    return <li key={node.path}>
      <button type="button" aria-expanded={open} title={node.path} onClick={() => toggle(node.path)} onKeyDown={event => {
        if (event.key === 'ArrowRight' && !open || event.key === 'ArrowLeft' && open) { event.preventDefault(); toggle(node.path); }
      }} style={{ paddingInlineStart: 8 + level * 12 }} className={cn('nav-node min-h-[var(--h-row)] w-full gap-2 pr-2', activeFolder === node.path && 'bg-[var(--selected)] text-[var(--text)]')}>
        {open ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
        {open ? <FolderOpen className="h-3.5 w-3.5 shrink-0" /> : <Folder className="h-3.5 w-3.5 shrink-0" />}
        <span className="min-w-0 flex-1 truncate text-left">{node.name}</span><span className="text-[var(--t-count)] text-[var(--text-muted)]">{node.count || ''}</span>
      </button>
      {open ? <ul aria-label={`${node.path} contents`}>{node.folders.map(child => folder(child, level + 1))}{node.records.map(record => <li key={record.id}>{row(record, level + 1)}</li>)}{!node.count && !node.folders.length ? <li className="px-6 py-2 text-[var(--t-meta)] text-[var(--text-muted)]">Empty folder</li> : null}</ul> : null}
    </li>;
  }
  function collection(id: string, label: string, items: WorkspaceDatabaseRecordModel[]) {
    if (!items.length) return null;
    const open = !!searchQuery || expanded.includes(id);
    return <section className="mt-3"><button type="button" className="nav-node min-h-[var(--h-row)] w-full gap-2 px-2" aria-expanded={open} onClick={() => setExpanded(current => open ? current.filter(p => p !== id) : [...current, id])}>{open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}<span className="flex-1 text-left">{label}</span><span className="text-[var(--t-count)]">{items.length}</span></button>{open ? items.map(record => row(record, 1)) : null}</section>;
  }
  const startResize = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const origin = event.clientX; const start = event.currentTarget.parentElement?.getBoundingClientRect().width ?? 300;
    const move = (next: globalThis.PointerEvent) => onResize(Math.max(180, Math.min(480, start + next.clientX - origin)));
    const stop = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop); window.removeEventListener('pointercancel', stop); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', stop); window.addEventListener('pointercancel', stop);
  };
  return <aside className="relative flex min-h-0 shrink-0 flex-col bg-[var(--mantle)]" style={{ width }} aria-label="Documents">
    <div className="grid gap-2 p-3">
      <div className="flex min-h-[var(--h-ctl)] items-center gap-2"><span className="text-[var(--t-section)] uppercase tracking-[0.14em] text-[var(--text)]">Docs</span><div className="flex-1" />
        <Control size="icon" variant="quiet" aria-label="Refresh vault folders" onClick={onRefresh}><RefreshCw className="h-3.5 w-3.5" /></Control>
        <div ref={menuRef} className="relative"><Control size="sm" variant="primary" loading={creating} onClick={() => setMenu(open => !open)} aria-expanded={menu}>New <ChevronDown className="h-3 w-3" /></Control>
          {menu ? <div className="absolute right-0 top-8 z-40 w-60 max-w-[80vw] rounded-[var(--r-plane)] bg-[var(--raised)] p-1.5 shadow-[var(--shadow-elevated)]">
            <Control variant="quiet" className="w-full justify-start" onClick={() => { setMenu(false); onCreate(null); }}><FilePlus className="h-3.5 w-3.5" />Note</Control>
            <Control variant="quiet" className="w-full justify-start" onClick={() => { setMenu(false); setNewFolder(''); setFolderError(null); }}><FolderPlus className="h-3.5 w-3.5" />Folder</Control>
            {records.filter(record => record._isTemplate).map(template => <Control key={template.id} variant="quiet" className="w-full justify-start" onClick={() => { setMenu(false); onCreate(template); }}>{documentDisplayTitle(template)}</Control>)}
          </div> : null}
        </div>
      </div>
      <Select aria-label="Document view" value={view} onChange={event => setView(event.target.value as DocsView)}><option value="folders">Vault folders</option><option value="recent">Recent</option><option value="favorites">Favorites</option><option value="reports">Reports</option><option value="journals">Journals</option><option value="outputs">Outputs</option></Select>
      <div className="relative"><Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" /><Input value={searchQuery} onChange={event => onSearch(event.target.value)} placeholder="Search documents and folders" aria-label="Search documents" className="pl-7" /></div>
      {newFolder !== null ? <form className="grid gap-2" onSubmit={async event => { event.preventDefault(); setFolderBusy(true); try { await onCreateFolder(newFolder); setNewFolder(null); setExpanded(current => [...new Set([...current, activeFolder])]); } catch (error) { setFolderError(String(error)); } finally { setFolderBusy(false); } }}>
        <span className="truncate text-[var(--t-meta)] text-[var(--text-muted)]" title={activeFolder || 'vault'}>New folder in {activeFolder || 'vault'}</span><Input autoFocus aria-label="Folder name" value={newFolder} onChange={event => setNewFolder(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') setNewFolder(null); }} /><div className="flex gap-2"><Control type="submit" loading={folderBusy}>Create</Control><Control onClick={() => setNewFolder(null)}>Cancel</Control></div>{folderError ? <p role="alert" className="text-[var(--t-meta)] text-[var(--bad)]">{folderError}</p> : null}
      </form> : null}
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
      {workspaceError ? <p role="alert" className="px-2 py-2 text-[var(--t-meta)] text-[var(--bad)]">Saved workspace documents could not be refreshed. <Control onClick={onRefresh}>Retry</Control></p> : null}
      {loadingVault ? <p role="status" className="px-2 py-2 text-[var(--t-meta)] text-[var(--text-muted)]">Reading vault folders…</p> : null}
      {vaultError || inventory?.errors.length ? <div role="alert" className="px-2 py-2 text-[var(--t-meta)] text-[var(--bad)]">{vaultError ? 'Vault folders could not be read. Saved documents remain available.' : `${inventory?.errors.length} folders could not be read. This list is incomplete.`}<Control variant="quiet" onClick={onRefresh}>Retry</Control></div> : null}
      {view === 'folders' ? <>
        <button type="button" className="nav-node mb-1 w-full px-2 text-[var(--text-muted)]" onClick={() => onFolder('')} title="Select vault root for new items">vault</button>
        <ul aria-label="Vault folders">{tree.folders.map(node => folder(node))}{tree.records.map(record => <li key={record.id}>{row(record)}</li>)}</ul>
        {collection('remote', 'Saved in workspace', remote)}{collection('templates', 'Templates', templates)}
      </> : quickResults.map(record => row(record, 0, true))}
      {!filtered.length && !tree.folders.length && !loadingVault ? <p className="px-2 py-3 text-[var(--t-meta)] text-[var(--text-muted)]">{searchQuery ? 'No documents match this search.' : view === 'favorites' ? 'Star a document to keep it here.' : 'No documents in this view.'}</p> : null}
    </div>
    <p className="truncate px-3 pb-2 text-[var(--t-meta)] text-[var(--text-muted)]" title={activeFolder || 'journal'}>New notes → {activeFolder || 'journal'}</p>
    {typeof width === 'number' ? <div role="separator" aria-orientation="vertical" aria-label="Resize document list" aria-valuemin={180} aria-valuemax={480} aria-valuenow={width} tabIndex={0} onPointerDown={startResize} onKeyDown={event => { if (event.key === 'ArrowLeft') onResize(Math.max(180, width - 10)); else if (event.key === 'ArrowRight') onResize(Math.min(480, width + 10)); else return; event.preventDefault(); }} className="absolute inset-y-0 right-0 w-1 cursor-col-resize hover:bg-[var(--hover)]" /> : null}
  </aside>;
}
function DocumentRow({ record, selected, favorite, pending, level, showPath, onSelect, onFavorite }: { record: WorkspaceDatabaseRecordModel; selected: boolean; favorite: boolean; pending: number; level: number; showPath: boolean; onSelect: (id: string) => void; onFavorite: (id: string) => void }) {
  const path = recordVaultPath(record);
  return <div className={cn('group mb-px flex items-center rounded-[var(--r-control)]', selected && 'bg-[var(--selected)] text-[var(--text)]')} style={{ paddingInlineStart: 8 + level * 12 }}>
    <button type="button" onClick={() => onSelect(record.id)} aria-current={selected ? 'page' : undefined} title={path ?? documentDisplayTitle(record)} className="nav-node min-h-[var(--h-row)] min-w-0 flex-1 py-1 pl-2 pr-1 text-left"><span className="min-w-0 flex-1"><span className="block truncate">{documentDisplayTitle(record)}</span>{showPath ? <span className="block truncate text-[var(--t-meta)] text-[var(--text-muted)]">{path ?? 'Saved in workspace'}</span> : null}</span>{pending ? <span title="Suggested edits" className="text-[var(--wait)]">{pending}</span> : null}{record._vaultMissing ? <span className="text-[var(--t-count)] text-[var(--text-muted)]">Unlinked</span> : null}</button>
    <button type="button" aria-label={`${favorite ? 'Unstar' : 'Star'} ${documentDisplayTitle(record)}`} aria-pressed={favorite} onClick={() => onFavorite(record.id)} className={cn('shrink-0 rounded-[var(--r-control)] p-1.5 text-[var(--text-muted)] focus-visible:opacity-100 group-hover:opacity-100', !favorite && 'opacity-0')}><Star className="h-3 w-3" fill={favorite ? 'currentColor' : 'none'} /></button>
  </div>;
}
