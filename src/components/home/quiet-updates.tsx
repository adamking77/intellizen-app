import { Control } from "@/components/ui/control";
import { ContentArrival, MotionList, MotionListItem } from "@/components/ui/motion";
import { quietNoteAction, setAsideQuietNote, useQuietNotes } from "@/lib/quiet-notes";

export function QuietUpdates() {
  const notes = useQuietNotes();
  if (!notes.length) return null;
  return (
    <ContentArrival><details className="mt-5 border-t border-[var(--surface-line)] pt-3">
      <summary className="cursor-pointer font-ui text-[var(--t-ui)] text-[var(--text)]">
        {notes.length} saved {notes.length === 1 ? "update" : "updates"}
        {notes.some((note) => note.kind === "error") ? " · includes failed actions" : ""}
      </summary>
      <p className="mt-2 text-[var(--t-meta)] text-[var(--text-muted)]">Updates kept while notifications were quiet, and actions that failed. Set aside each one when you have reviewed it.</p>
      <MotionList role="list" className="mt-2 divide-y divide-[var(--row-line)]">
        {notes.map((note) => (
          <MotionListItem role="listitem" key={note.id} className="flex items-start gap-3 py-3">
            <div className="min-w-0 flex-1 break-words text-[var(--t-ui)] text-[var(--text)]">
              <p>{note.kind === "error" ? <span className="text-[var(--bad)]">Failed · </span> : null}{note.message}</p>
              {note.description ? <p className="mt-1 whitespace-pre-wrap text-[var(--t-meta)] text-[var(--text-muted)]">{note.description}</p> : null}
              <time dateTime={new Date(note.createdAt).toISOString()} className="mt-1 block text-[var(--t-meta)] text-[var(--text-muted)]">{new Date(note.createdAt).toLocaleString()}</time>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              {quietNoteAction(note.id) ? <Control size="sm" variant="text" onClick={() => quietNoteAction(note.id)?.onClick()}>{quietNoteAction(note.id)?.label}</Control> : null}
              <Control size="sm" variant="text" aria-label={`Set aside update: ${note.message}`} onClick={() => setAsideQuietNote(note.id)}>Set aside</Control>
            </div>
          </MotionListItem>
        ))}
      </MotionList>
    </details></ContentArrival>
  );
}
