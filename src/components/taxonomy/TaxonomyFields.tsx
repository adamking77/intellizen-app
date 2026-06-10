import { Input } from "@/components/ui/input";
import {
  TAXONOMY_AREA_OPTIONS,
  TAXONOMY_ENTITY_OPTIONS,
  taxonomyAreaLabel,
  taxonomyEntityLabel,
  taxonomyFolderLabel,
} from "@/lib/taxonomy";
import type { TaxonomyMetadata } from "@/lib/types";

type TaxonomyDraft = {
  entity: string;
  area: string;
  folder: string;
};

type TaxonomyFieldsProps = {
  value: TaxonomyDraft;
  onChange: (value: TaxonomyDraft) => void;
  className?: string;
};

export function taxonomyDraftFromMetadata(
  taxonomy: TaxonomyMetadata | null | undefined,
  fallback?: Partial<TaxonomyDraft>,
): TaxonomyDraft {
  return {
    entity: typeof taxonomy?.entity === "string" ? taxonomy.entity : fallback?.entity ?? "genzen",
    area: typeof taxonomy?.area === "string" ? taxonomy.area : fallback?.area ?? "internal_ops",
    folder: typeof taxonomy?.folder === "string" ? taxonomy.folder : fallback?.folder ?? "",
  };
}

export function TaxonomyFields({ value, onChange, className }: TaxonomyFieldsProps) {
  return (
    <div className={className ?? "grid gap-2"}>
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1.5">
          <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
            Entity
          </span>
          <select
            className="h-9 rounded-md border border-[var(--border)] bg-[var(--base)] px-2.5 font-ui text-[12px] text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
            value={value.entity}
            onChange={(event) => onChange({ ...value, entity: event.target.value })}
          >
            {TAXONOMY_ENTITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1.5">
          <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
            Area
          </span>
          <select
            className="h-9 rounded-md border border-[var(--border)] bg-[var(--base)] px-2.5 font-ui text-[12px] text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
            value={value.area}
            onChange={(event) => onChange({ ...value, area: event.target.value })}
          >
            {TAXONOMY_AREA_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="grid gap-1.5">
        <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
          Folder
        </span>
        <Input
          placeholder="Folder or initiative"
          value={value.folder}
          onChange={(event) => onChange({ ...value, folder: event.target.value })}
        />
      </label>
    </div>
  );
}

export function TaxonomySummary({ taxonomy }: { taxonomy?: TaxonomyMetadata | null }) {
  return (
    <span className="font-ui text-[11px] text-[var(--overlay-1)]">
      {taxonomyEntityLabel(taxonomy)} / {taxonomyAreaLabel(taxonomy)} / {taxonomyFolderLabel(taxonomy)}
    </span>
  );
}
