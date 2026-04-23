import { useEffect, useMemo, useRef } from "react";
import { filterSuggestionItems } from "@blocknote/core/extensions";
import { isStyledTextInlineContent } from "@blocknote/core";
import {
  BlockTypeSelect,
  FormattingToolbar,
  FormattingToolbarController,
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
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
  const isHydratingRef = useRef(false);
  const lastLoadedValueRef = useRef<string | null>(null);
  const lastEmittedValueRef = useRef<string | null>(null);

  useEffect(() => {
    if (lastEmittedValueRef.current === initialValue) return;
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

  const slashMenuItems = useMemo(
    () =>
      getDefaultReactSlashMenuItems(editor).map((item) => ({
        ...item,
        onItemClick: () => {
          const currentBlock = editor.getTextCursorPosition().block;
          const blockContent = currentBlock.content;

          if (Array.isArray(blockContent)) {
            let blockText = "";
            let isPlainSlashQuery = blockContent.length > 0;

            for (const inlineContent of blockContent) {
              if (!isStyledTextInlineContent(inlineContent) || inlineContent.type !== "text") {
                isPlainSlashQuery = false;
                break;
              }

              blockText += inlineContent.text;
            }

            if (isPlainSlashQuery && /^\s*\/\S*$/.test(blockText)) {
              const normalizedBlock = editor.updateBlock(currentBlock, {
                content: [{ type: "text", text: "/", styles: {} }],
              });

              editor.setTextCursorPosition(normalizedBlock);
            }
          }

          item.onItemClick();
        },
      })),
    [editor],
  );

  return (
    <div className="intelizen-live-markdown">
      <BlockNoteView editor={editor} theme="dark" formattingToolbar={false} slashMenu={false} autoFocus>
        <SuggestionMenuController
          triggerCharacter="/"
          getItems={async (query) => filterSuggestionItems(slashMenuItems, query)}
          shouldOpen={(state) => !state.selection.$from.parent.type.isInGroup("tableContent")}
        />
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
