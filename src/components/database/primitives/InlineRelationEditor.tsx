import { useRef, useState } from "react";

import { Badge } from "@/components/database/primitives/Badge";
import { RecordPickerDropdown } from "@/components/database/primitives/RecordPickerDropdown";
import { resolveRelationColor } from "@/lib/database-colors";

interface RelationOption {
  id: string;
  label: string;
  meta?: string;
}

interface InlineRelationEditorProps {
  values: string[];
  options: RelationOption[];
  onChange: (values: string[]) => void;
}

export function InlineRelationEditor({
  values,
  options,
  onChange,
}: InlineRelationEditorProps) {
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const optionsById = new Map(options.map((option) => [option.id, option]));

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
        className="flex min-h-9 min-w-[72px] flex-wrap items-center gap-1 rounded-xl border border-transparent px-2 py-1 text-left transition-[background-color,border-color,color] duration-150 hover:border-[var(--border-subtle)] hover:bg-[var(--surface-wash)]"
      >
        {values.length ? (
          values.map((value) => (
            <Badge key={value} color={resolveRelationColor(optionsById.get(value)?.label ?? value)}>
              {optionsById.get(value)?.label ?? value}
            </Badge>
          ))
        ) : (
          <span className="text-[13px] text-[var(--overlay-1)] opacity-60">—</span>
        )}
      </button>

      <RecordPickerDropdown
        anchorRef={anchorRef}
        open={open}
        options={options}
        selectedIds={values}
        onClearSelection={() => onChange([])}
        onToggle={(id) => {
          if (values.includes(id)) {
            onChange(values.filter((value) => value !== id));
            return;
          }
          onChange([...values, id]);
        }}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
