import { useRef } from "react";
import { ArrowUpRight, Database, Upload } from "lucide-react";

import { Badge } from "@/components/database/primitives/Badge";
import { Button } from "@/components/ui/button";
import { resolveFieldOptionColor, resolveStatusColor } from "@/lib/database-colors";
import { getFieldValue, getRecordTitle, getViewRecords } from "@/lib/database-core";
import type {
  WorkspaceDatabaseCatalogEntry,
  WorkspaceDatabaseFieldValue,
  WorkspaceDatabaseModel,
} from "@/lib/types";
import { cn } from "@/lib/utils";

interface DatabaseGalleryViewProps {
  database: WorkspaceDatabaseModel;
  view: WorkspaceDatabaseModel["views"][number];
  catalog: WorkspaceDatabaseCatalogEntry[];
  activeRecordId: string | null;
  onOpenRecord: (recordId: string) => void;
  onUpdateField: (recordId: string, fieldId: string, value: WorkspaceDatabaseFieldValue) => Promise<void> | void;
}

export function DatabaseGalleryView({
  database,
  view,
  catalog,
  activeRecordId,
  onOpenRecord,
  onUpdateField,
}: DatabaseGalleryViewProps) {
  const records = getViewRecords(database, view, catalog);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const titleFieldId =
    database.headerFieldIds?.[0] ??
    database.schema.find((field) => field.type === "text")?.id ??
    database.schema[0]?.id;

  const inferCoverField =
    database.schema.find((field) => /cover|image|photo|thumbnail/i.test(field.name)) ??
    database.schema.find((field) => field.id === view.cardCoverField) ??
    database.schema.find((field) => field.type === "url");

  const cardFields = (view.cardFields?.length ? view.cardFields : database.schema
    .filter((field) => field.id !== titleFieldId && field.id !== inferCoverField?.id && field.type !== "createdAt" && field.type !== "lastEditedAt")
    .slice(0, 3)
    .map((field) => field.id))
    .map((fieldId) => database.schema.find((field) => field.id === fieldId))
    .filter((field): field is NonNullable<typeof field> => Boolean(field));

  async function handleFileChange(recordId: string, fieldId: string, file: File | null) {
    if (!file) return;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    await onUpdateField(recordId, fieldId, dataUrl);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {records.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-[var(--border)] bg-[var(--mantle)] text-[13px] text-[var(--subtext-0)]">
            No records yet. Create one to populate the gallery.
          </div>
        ) : (
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
            {records.map((record) => {
              const coverValue = inferCoverField ? getFieldValue(record, inferCoverField, database, catalog) : null;
              const statusField = database.schema.find((field) => field.type === "status" || field.type === "select");
              const statusValue = statusField ? String(getFieldValue(record, statusField, database, catalog) ?? "") : "";
              const fallbackColor = statusField
                ? statusField.type === "status"
                  ? resolveStatusColor(statusValue)
                  : resolveFieldOptionColor(statusField, statusValue || "No value")
                : "var(--surface-wash)";
              const imageLike = typeof coverValue === "string" && isLikelyImage(coverValue);

              return (
                <button
                  key={record.id}
                  type="button"
                  onClick={() => onOpenRecord(record.id)}
                  className={cn(
                    "group overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--mantle)] text-left transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-wash)]",
                    activeRecordId === record.id && "border-[var(--accent-border)] bg-[var(--accent-soft)]",
                  )}
                >
                  <div className="relative h-[120px] overflow-hidden border-b border-[var(--border)]">
                    {imageLike ? (
                      <img src={String(coverValue)} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center" style={{ background: fallbackColor }}>
                        <Database className="h-8 w-8 text-[var(--crust)]" />
                      </div>
                    )}
                    <ArrowUpRight className="absolute right-3 top-3 h-4 w-4 text-[var(--overlay-1)] opacity-0 transition-opacity group-hover:opacity-100" />
                    {inferCoverField ? (
                      <>
                        <input
                          ref={(node) => {
                            fileInputRefs.current[record.id] = node;
                          }}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(event) => void handleFileChange(record.id, inferCoverField.id, event.target.files?.[0] ?? null)}
                        />
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={(event) => {
                            event.stopPropagation();
                            fileInputRefs.current[record.id]?.click();
                          }}
                          className="absolute bottom-3 right-3 opacity-0 transition-opacity group-hover:opacity-100"
                        >
                          <Upload className="h-3.5 w-3.5" />
                          {imageLike ? "Replace image" : "Upload image"}
                        </Button>
                      </>
                    ) : null}
                  </div>

                  <div className="space-y-3 p-4">
                    <div className="truncate text-[15px] font-semibold tracking-[-0.02em] text-[var(--text)]">
                      {getRecordTitle(record, database)}
                    </div>

                    <div className="space-y-2">
                      {cardFields.map((field) => {
                        const value = getFieldValue(record, field, database, catalog);
                        if (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) {
                          return null;
                        }

                        if (field.type === "status" || field.type === "select") {
                          const textValue = String(value);
                          return (
                            <Badge
                              key={field.id}
                              color={field.type === "status" ? resolveStatusColor(textValue) : resolveFieldOptionColor(field, textValue)}
                            >
                              {textValue}
                            </Badge>
                          );
                        }

                        return (
                          <div key={field.id} className="space-y-1">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
                              {field.name}
                            </div>
                            <div className="line-clamp-2 text-[13px] text-[var(--subtext-0)]">
                              {Array.isArray(value) ? value.join(", ") : String(value)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function isLikelyImage(value: string) {
  return value.startsWith("data:image/") || /\.(png|jpe?g|webp|gif|svg)$/i.test(value);
}
