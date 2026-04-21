import { useEffect, useRef } from "react";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { Bold, Italic, List, ListTodo } from "lucide-react";

import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";

interface DatabaseRichTextEditorProps {
  initialValue: string;
  onChange: (value: string) => void;
}

export function DatabaseRichTextEditor({
  initialValue,
  onChange,
}: DatabaseRichTextEditorProps) {
  const editor = useCreateBlockNote({
    defaultStyles: false,
  });
  const isHydratingRef = useRef(false);
  const lastLoadedValueRef = useRef<string | null>(null);
  const lastEmittedValueRef = useRef<string | null>(null);

  useEffect(() => {
    if (lastLoadedValueRef.current === initialValue) return;

    lastLoadedValueRef.current = initialValue;
    lastEmittedValueRef.current = initialValue;
    isHydratingRef.current = true;

    const blocks = initialValue.trim()
      ? editor.tryParseMarkdownToBlocks(initialValue)
      : [{ type: "paragraph" as const }];

    editor.replaceBlocks(editor.document, blocks);

    queueMicrotask(() => {
      isHydratingRef.current = false;
    });
  }, [editor, initialValue]);

  useEffect(() => {
    return editor.onChange(() => {
      if (isHydratingRef.current) return;

      const nextValue = editor.blocksToMarkdownLossy(editor.document);
      if (nextValue === lastEmittedValueRef.current) return;

      lastEmittedValueRef.current = nextValue;
      onChange(nextValue);
    });
  }, [editor, onChange]);

  function withSelectedBlocks(fn: (block: (typeof editor.document)[number]) => void) {
    const blocks = editor.getSelection()?.blocks ?? [editor.getTextCursorPosition().block];
    editor.focus();
    editor.transact(() => {
      for (const block of blocks) {
        fn(block);
      }
    });
  }

  return (
    <div className="db-rich-editor">
      <div className="db-rich-editor-toolbar">
        <button
          type="button"
          className="db-rich-editor-toolbar-btn"
          onClick={() => {
            editor.focus();
            editor.toggleStyles({ bold: true });
          }}
          title="Bold"
          aria-label="Bold"
        >
          <Bold className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="db-rich-editor-toolbar-btn"
          onClick={() => {
            editor.focus();
            editor.toggleStyles({ italic: true });
          }}
          title="Italic"
          aria-label="Italic"
        >
          <Italic className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="db-rich-editor-toolbar-btn"
          onClick={() => withSelectedBlocks((block) => editor.updateBlock(block, { type: "bulletListItem" }))}
          title="Bullet list"
          aria-label="Bullet list"
        >
          <List className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="db-rich-editor-toolbar-btn"
          onClick={() => withSelectedBlocks((block) => editor.updateBlock(block, { type: "checkListItem" }))}
          title="Todo list"
          aria-label="Todo list"
        >
          <ListTodo className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="db-rich-editor-surface">
        <BlockNoteView
          editor={editor}
          theme="dark"
          formattingToolbar={false}
          sideMenu={false}
        />
      </div>
    </div>
  );
}
