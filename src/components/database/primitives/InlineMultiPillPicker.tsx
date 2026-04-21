import { useState, type RefObject } from "react";

import { Badge } from "@/components/database/primitives/Badge";
import {
  RecordPickerDropdown,
  type RecordPickerOption,
} from "@/components/database/primitives/RecordPickerDropdown";

interface InlineMultiPillPickerProps {
  anchorRef?: RefObject<HTMLElement | null>;
  options: Array<string | RecordPickerOption>;
  values: string[];
  getColor: (option: string) => string;
  onChange: (values: string[]) => void;
  onCreate?: (label: string) => void;
}

export function InlineMultiPillPicker({
  anchorRef,
  options,
  values,
  getColor,
  onChange,
  onCreate,
}: InlineMultiPillPickerProps) {
  const [open, setOpen] = useState(false);
  const localAnchorRef = anchorRef ?? ({ current: null } as RefObject<HTMLElement | null>);
  const normalizedOptions = options.map((option) =>
    typeof option === "string" ? { id: option, label: option } : option,
  );
  const labelById = new Map(normalizedOptions.map((option) => [option.id, option.label]));

  return (
    <>
      <button
        ref={localAnchorRef as RefObject<HTMLButtonElement>}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
        className="flex min-h-9 min-w-[72px] flex-wrap items-center gap-1 rounded-xl border border-transparent px-2 py-1 text-left transition-[background-color,border-color,color] duration-150 hover:border-[var(--border-subtle)] hover:bg-[var(--surface-wash)]"
      >
        {values.length ? (
          values.map((value) => (
            <Badge key={value} color={getColor(value)}>
              {labelById.get(value) ?? value}
            </Badge>
          ))
        ) : (
          <span className="text-[13px] text-[var(--overlay-1)] opacity-60">—</span>
        )}
      </button>

      <RecordPickerDropdown
        anchorRef={localAnchorRef}
        open={open}
        options={normalizedOptions}
        selectedIds={values}
        onClearSelection={() => onChange([])}
        onCreate={
          onCreate
            ? (label) => {
                onCreate(label);
                if (!values.includes(label)) onChange([...values, label]);
              }
            : undefined
        }
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
