import { useEffect, useRef } from "react";
import {
  BlockTypeSelect,
  FormattingToolbar,
  FormattingToolbarController,
  useCreateBlockNote,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";

interface InlineMarkdownEditorProps {
  initialValue: string;
  onChange: (value: string) => void;
}

export function InlineMarkdownEditor({ initialValue, onChange }: InlineMarkdownEditorProps) {
  const editor = useCreateBlockNote({
    defaultStyles: false,
  });
  const didHydrateRef = useRef(false);
  const isHydratingRef = useRef(false);
  const lastSyncedValueRef = useRef<string | null>(null);

  useEffect(() => {
    if (didHydrateRef.current) return;

    didHydrateRef.current = true;
    lastSyncedValueRef.current = initialValue;
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
      if (nextValue === lastSyncedValueRef.current) return;

      lastSyncedValueRef.current = nextValue;
      onChange(nextValue);
    });
  }, [editor, onChange]);

  return (
    <div className="intelizen-live-markdown">
      <BlockNoteView editor={editor} theme="dark" formattingToolbar={false}>
        <FormattingToolbarController
          formattingToolbar={() => (
            <FormattingToolbar>
              <BlockTypeSelect key="blockTypeSelect" />
            </FormattingToolbar>
          )}
        />
      </BlockNoteView>
    </div>
  );
}
