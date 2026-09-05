// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { DocsRail } from './docs-rail';
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot>;
afterEach(async () => { await act(async () => root?.unmount()); document.body.replaceChildren(); localStorage.clear(); });
async function render(search = '') {
 const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
 await act(async () => root.render(<DocsRail records={[{id:'a',doc_title:'Client report',doc_vault_path:'vault:work/client/report.md'}, {id:'remote',doc_title:'Remote draft'}]} projects={[]} proposalCounts={{}} selectedRecordId={null} searchQuery={search} width={300} creating={false} activeFolder="" onFolder={vi.fn()} onRefresh={vi.fn()} onSearch={vi.fn()} onSelect={vi.fn()} onCreate={vi.fn()} onCreateFolder={vi.fn()} onResize={vi.fn()} />)); return host;
}
it('starts with collapsed folders and exposes nested files only on disclosure', async () => {
 const host = await render(); expect(host.textContent).not.toContain('Client report');
 const work = host.querySelector<HTMLButtonElement>('[title="work"]')!;
 expect(work.getAttribute('aria-expanded')).toBe('false');
 await act(async () => work.click());
 await act(async () => host.querySelector<HTMLButtonElement>('[title="work/client"]')!.click());
 expect(host.textContent).toContain('Client report');
 expect(host.textContent).not.toContain('Remote draft');
});
it('search reveals matching branches without requiring folder expansion', async () => {
 const host = await render('Client report'); expect(host.textContent).toContain('Client report');
 expect(host.querySelector('[title="work"]')?.getAttribute('aria-expanded')).toBe('true');
});
it('favorites point to the same document across views', async () => {
 const host = await render('Client report');
 await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Star Client report"]')!.click());
 expect(JSON.parse(localStorage.getItem('intelizen:docs-favorites')!)).toEqual(['a']);
 expect(host.querySelector('[aria-label="Unstar Client report"]')?.getAttribute('aria-pressed')).toBe('true');
});
