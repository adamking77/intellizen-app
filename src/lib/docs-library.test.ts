import { expect, it } from 'vitest';
import { buildDocumentFolders, canonicalDocumentPath, mergeVaultDocuments, matchesDocsView, visibleVaultFile, visibleVaultFolder } from './docs-library';
it('joins every supported spelling to the existing workspace identity', () => {
  const inventory = { files: [{ path: 'intelligence/documents/a.md', name: 'a.md' }], folders: [], errors: [] };
  for (const path of ['documents/a.md', '/Users/adam/vault/intelligence/documents/a.md', 'vault:intelligence/documents/a.md']) {
    expect(mergeVaultDocuments([{ id: 'stable-uuid', doc_vault_path: path }], inventory).map(row => row.id)).toEqual(['stable-uuid']);
  }
});
it('builds physical nested folders independent of project links and folder metadata', () => {
  const root = buildDocumentFolders([{ id: 'one', doc_vault_path: 'vault:work/client/reports/a.md', doc_folder: 'Wrong folder', doc_project: 'different-project' }], ['journal']);
  expect(root.folders.map(f => f.name)).toEqual(['journal', 'work']);
  expect(root.folders[1].folders[0].folders[0].records[0].id).toBe('one');
});
it('keeps remote-only and missing-source records when local files are absent', () => {
  const rows = mergeVaultDocuments([{ id: 'remote' }, { id: 'missing', doc_vault_path: 'documents/gone.md' }], { files: [], folders: [], errors: [] });
  expect(rows.map(r => r.id)).toEqual(['remote', 'missing']);
  expect(rows[1]._vaultMissing).toBe(true);
});
it('excludes runtime trees and unsafe paths without excluding real research and reports', () => {
  for (const path of ['shared/systems/a.md', 'shared/identity/agents/codex/soul.md', '.sync-history/a.md', 'session/scripts/a.md', 'work/client/node_modules/a.md']) expect(visibleVaultFile(path)).toBe(false);
  expect(visibleVaultFolder('work/client/reports')).toBe(true);
  expect(visibleVaultFile('work/client/report.md')).toBe(true);
  expect(visibleVaultFile('work/client/.env')).toBe(false);
  for (const path of ['vault:../outside.md', 'vault:/outside.md', '/Users/adam/Desktop/a.md']) expect(canonicalDocumentPath(path)).toBe(null);
});
it('quick views refer to existing documents without changing their folder', () => {
  const row = { id: 'a', doc_vault_path: 'vault:work/client/reports/a.md' };
  expect(matchesDocsView(row, 'reports', [])).toBe(true);
  expect(matchesDocsView(row, 'favorites', ['a'])).toBe(true);
  expect(matchesDocsView(row, 'journals', [])).toBe(false);
});
it('keeps extensionless authored reports and hides runtime state archives', () => {
 expect(visibleVaultFile('initiatives/genzen-solutions/departments/delivery/investigations/case-2026-001/pda-what-works-what-backfires')).toBe(true);
 expect(visibleVaultFile('session/logs/state-archive/2026-03-04.md')).toBe(false);
});
