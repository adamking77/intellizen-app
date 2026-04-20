import type { RefObject } from "react";
import { Bold, Italic, ListTodo, List as ListIcon } from "lucide-react";

import { cn } from "@/lib/utils";

interface MarkdownToolbarProps {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  className?: string;
}

export function MarkdownToolbar({ textareaRef, className }: MarkdownToolbarProps) {
  function applyWrapper(before: string, after = before) {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.slice(start, end);
    const nextText = `${before}${selected || "text"}${after}`;
    textarea.setRangeText(nextText, start, end, "end");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.focus();
  }

  function applyPrefix(prefix: string) {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.slice(start, end);
    const nextText = `${prefix}${selected || ""}`;
    textarea.setRangeText(nextText, start, end, "end");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.focus();
  }

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <ToolbarButton label="Bold" onClick={() => applyWrapper("**")} icon={<Bold className="h-3.5 w-3.5" />} />
      <ToolbarButton label="Italic" onClick={() => applyWrapper("*")} icon={<Italic className="h-3.5 w-3.5" />} />
      <ToolbarButton label="Bullet" onClick={() => applyPrefix("- ")} icon={<ListIcon className="h-3.5 w-3.5" />} />
      <ToolbarButton label="Todo" onClick={() => applyPrefix("- [ ] ")} icon={<ListTodo className="h-3.5 w-3.5" />} />
    </div>
  );
}

function ToolbarButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--base)] text-[var(--overlay-1)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)]"
      title={label}
      aria-label={label}
    >
      {icon}
    </button>
  );
}
