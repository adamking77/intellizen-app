import { useEffect, useMemo, useRef } from "react";
import { en } from "@blocknote/core/locales";
import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import { Bold, Italic, List, ListTodo } from "lucide-react";
import "@blocknote/mantine/style.css";

import { FieldShell } from "@/components/ui/field-shell";
import type { SaveStateValue } from "@/components/ui/save-state";
import { cn } from "@/lib/utils";

interface NarrativeEditorProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  status?: SaveStateValue;
  onRetry?: () => void;
  placeholder?: string;
  size?: "standard" | "large";
  className?: string;
}

function countWords(value: string): number {
  const trimmed = value.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export function NarrativeEditor({
  label,
  value,
  onChange,
  onBlur,
  status = "idle",
  onRetry,
  placeholder = "Add context…",
  size = "standard",
  className,
}: NarrativeEditorProps) {
  const dictionary = useMemo(() => ({
    ...en,
    placeholders: {
      ...en.placeholders,
      default: placeholder,
      emptyDocument: placeholder,
    },
  }), [placeholder]);
  const editor = useCreateBlockNote({ defaultStyles: false, dictionary }, [dictionary]);
  const isHydratingRef = useRef(false);
  const lastLoadedValueRef = useRef<string | null>(null);
  const lastEmittedValueRef = useRef<string | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (lastEmittedValueRef.current === value || lastLoadedValueRef.current === value) return;

    lastLoadedValueRef.current = value;
    lastEmittedValueRef.current = value;
    isHydratingRef.current = true;
    const blocks = value.trim()
      ? editor.tryParseMarkdownToBlocks(value)
      : [{ type: "paragraph" as const }];
    editor.replaceBlocks(editor.document, blocks);
    queueMicrotask(() => { isHydratingRef.current = false; });
  }, [editor, value]);

  useEffect(() => editor.onChange(() => {
    if (isHydratingRef.current) return;
    const nextValue = editor.blocksToMarkdownLossy(editor.document);
    if (nextValue === lastEmittedValueRef.current) return;
    lastEmittedValueRef.current = nextValue;
    onChange(nextValue);
  }), [editor, onChange]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const root = surfaceRef.current ?? editor.domElement;
      const editable = root?.matches("[contenteditable='true']")
        ? root
        : root?.querySelector<HTMLElement>("[contenteditable='true']");
      editable?.setAttribute("aria-label", label);
    });
    return () => cancelAnimationFrame(frame);
  }, [editor, label]);

  function withSelectedBlocks(fn: (block: (typeof editor.document)[number]) => void) {
    const blocks = editor.getSelection()?.blocks ?? [editor.getTextCursorPosition().block];
    editor.focus();
    editor.transact(() => blocks.forEach(fn));
  }

  const toolbar = (
    <div className="narrative-editor-toolbar" aria-label={`${label} formatting`}>
      <button type="button" className="narrative-editor-toolbar-btn" onClick={() => { editor.focus(); editor.toggleStyles({ bold: true }); }} title="Bold" aria-label="Bold">
        <Bold className="h-3.5 w-3.5" />
      </button>
      <button type="button" className="narrative-editor-toolbar-btn" onClick={() => { editor.focus(); editor.toggleStyles({ italic: true }); }} title="Italic" aria-label="Italic">
        <Italic className="h-3.5 w-3.5" />
      </button>
      <button type="button" className="narrative-editor-toolbar-btn" onClick={() => withSelectedBlocks((block) => editor.updateBlock(block, { type: "bulletListItem" }))} title="Bullet list" aria-label="Bullet list">
        <List className="h-3.5 w-3.5" />
      </button>
      <button type="button" className="narrative-editor-toolbar-btn" onClick={() => withSelectedBlocks((block) => editor.updateBlock(block, { type: "checkListItem" }))} title="Todo list" aria-label="Todo list">
        <ListTodo className="h-3.5 w-3.5" />
      </button>
    </div>
  );

  return (
    <FieldShell
      label={label}
      status={status}
      onRetry={onRetry}
      meta={`${countWords(value)} words`}
      actions={toolbar}
      className={cn("group/narrative narrative-editor", className)}
      contentClassName="p-0"
    >
      <div
        ref={surfaceRef}
        className={cn("narrative-editor-surface", `narrative-editor-surface--${size}`)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onBlur?.();
        }}
      >
        <BlockNoteView editor={editor} theme="dark" formattingToolbar={false} sideMenu={false} />
      </div>
    </FieldShell>
  );
}
