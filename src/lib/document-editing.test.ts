import { expect, it } from 'vitest';
import { composeDocument, documentPage } from './document-editing';
it('preserves a trailing space while the user is typing the next title word', () => {
 const raw = composeDocument('# Old\n\nBody', 'Verification ', 'Body', 'doc-id');
 expect(documentPage(raw, 'Old').title).toBe('Verification ');
 expect(documentPage(composeDocument(raw, 'Verification note', 'Body', 'doc-id'), 'Old').title).toBe('Verification note');
});
