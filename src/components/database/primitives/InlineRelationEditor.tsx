import { useRef, useState } from "react";
import { ChevronDown, Link2 } from "lucide-react";

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
        className="flex min-h-8 flex-wrap items-center gap-1 text-left"
      >
        {values.length ? (
          values.map((value) => (
            <Badge key={value} color={resolveRelationColor(optionsById.get(value)?.label ?? value)}>
              {optionsById.get(value)?.label ?? value}
            </Badge>
          ))
        ) : (
          <span className="inline-flex items-center gap-1 text-[12px] text-[var(--overlay-1)]">
            <Link2 className="h-3.5 w-3.5" />
            Link records
          </span>
        )}
        <ChevronDown className="h-3.5 w-3.5 text-[var(--overlay-1)]" />
      </button>

      <RecordPickerDropdown
        anchorRef={anchorRef}
        open={open}
        options={options}
        selectedIds={values}
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
