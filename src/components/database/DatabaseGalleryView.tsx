import { useRef } from "react";
import { Plus } from "lucide-react";

import { Badge } from "@/components/database/primitives/Badge";
import { resolveFieldOptionColor, resolveRelationColor, resolveStatusColor } from "@/lib/database-colors";
import {
  getFieldDisplayValue,
  getRecordTitle,
  getViewRecords,
  getVisibleFields,
  resolveRelationLabel,
} from "@/lib/database-core";
import type {
  WorkspaceDatabaseCatalogEntry,
  WorkspaceDatabaseField,
  WorkspaceDatabaseFieldValue,
  WorkspaceDatabaseModel,
} from "@/lib/types";

interface DatabaseGalleryViewProps {
  database: WorkspaceDatabaseModel;
  view: WorkspaceDatabaseModel["views"][number];
  catalog: WorkspaceDatabaseCatalogEntry[];
  activeRecordId: string | null;
  onOpenRecord: (recordId: string) => void;
  onCreateRecord: () => void;
  onUpdateField: (recordId: string, fieldId: string, value: WorkspaceDatabaseFieldValue) => Promise<void> | void;
}

function isCoverCandidate(field: WorkspaceDatabaseField): boolean {
  return field.type === "url" || field.type === "text";
}

function hasImageLikeName(field: WorkspaceDatabaseField): boolean {
  return /image|cover|thumbnail|photo|picture|avatar/i.test(field.name);
}

function inferCoverField(
  view: WorkspaceDatabaseModel["views"][number],
  database: WorkspaceDatabaseModel,
): WorkspaceDatabaseField | undefined {
  if (view.cardCoverField) {
    const configured = database.schema.find((field) => field.id === view.cardCoverField);
    if (configured && isCoverCandidate(configured)) return configured;
  }
  const named = database.schema.find((field) => isCoverCandidate(field) && hasImageLikeName(field));
  if (named) return named;
  return database.schema.find((field) => field.type === "url");
}

function isLikelyImage(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^data:image\//i.test(trimmed)) return true;
  return /(?:^https?:\/\/|^\/|^\.\/|^\.\.\/).+\.(?:png|jpe?g|gif|webp|svg|avif)(?:[?#].*)?$/i.test(trimmed);
}

export function DatabaseGalleryView({
  database,
  view,
  catalog,
  activeRecordId,
  onOpenRecord,
  onCreateRecord,
  onUpdateField,
}: DatabaseGalleryViewProps) {
  const records = getViewRecords(database, view, catalog);
  const coverField = inferCoverField(view, database);
  const cardFields = view.cardFields
    ? database.schema.filter((field) => view.cardFields!.includes(field.id))
    : getVisibleFields(database.schema, view)
        .filter((field) => field.id !== coverField?.id)
        .slice(1, 4);

  return (
    <div className="db-gallery-root">
      <div className="grid gap-3 p-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
        {records.map((record) => {
        const title = getRecordTitle(record, database);
        const rawCoverValue = coverField ? record[coverField.id] : undefined;
        const coverImage = isLikelyImage(rawCoverValue) ? rawCoverValue : undefined;
        const statusField = database.schema.find((field) => field.type === "status");
        const statusValue = statusField ? String(record[statusField.id] ?? "") : "";

        return (
          <div
            key={record.id}
            className="db-gallery-card"
            style={{
              borderColor: activeRecordId === record.id ? "var(--accent)" : undefined,
              backgroundColor: activeRecordId === record.id ? "var(--surface-wash)" : undefined,
            }}
            onClick={() => onOpenRecord(record.id)}
          >
            <div
              className="db-gallery-cover"
              style={{
                backgroundColor: coverImage
                  ? "var(--base)"
                  : statusValue
                    ? resolveStatusColor(statusValue, statusField)
                    : "var(--base)",
              }}
            >
              {coverImage ? (
                <img src={coverImage} alt="" className="db-gallery-cover-img" />
              ) : (
                <span className="db-gallery-cover-placeholder">📄</span>
              )}
              {coverField ? (
                <ImageUploadButton
                  record={record}
                  coverField={coverField}
                  hasImage={Boolean(coverImage)}
                  onUpdateField={onUpdateField}
                />
              ) : (
                <span className="absolute right-2 bottom-2 text-[10px] opacity-60">
                  Set card image field in View
                </span>
              )}
            </div>
            <div className="db-gallery-body">
              <div className="db-gallery-title">{title}</div>
              {cardFields.map((field) => {
                const rawValue = record[field.id];
                if (rawValue == null || rawValue === "" || (Array.isArray(rawValue) && rawValue.length === 0)) {
                  return null;
                }

                if (field.type === "status" && typeof rawValue === "string") {
                  return (
                    <div key={field.id} className="db-gallery-field">
                      <span className="db-gallery-field-name">{field.name}</span>
                      <div className="db-gallery-field-value">
                        <Badge color={resolveStatusColor(rawValue, field)}>{rawValue}</Badge>
                      </div>
                    </div>
                  );
                }

                if (field.type === "select" && typeof rawValue === "string") {
                  return (
                    <div key={field.id} className="db-gallery-field">
                      <span className="db-gallery-field-name">{field.name}</span>
                      <div className="db-gallery-field-value">
                        <Badge color={resolveFieldOptionColor(field, rawValue)}>{rawValue}</Badge>
                      </div>
                    </div>
                  );
                }

                if (field.type === "multiselect" && Array.isArray(rawValue)) {
                  return (
                    <div key={field.id} className="db-gallery-field">
                      <span className="db-gallery-field-name">{field.name}</span>
                      <div className="db-gallery-field-badges">
                        {rawValue.map((value) => (
                          <Badge key={value} color={resolveFieldOptionColor(field, value)}>
                            {value}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  );
                }

                if (field.type === "relation" && Array.isArray(rawValue)) {
                  return (
                    <div key={field.id} className="db-gallery-field">
                      <span className="db-gallery-field-name">{field.name}</span>
                      <div className="db-gallery-field-badges">
                        {rawValue.map((relationId) => {
                          const label = resolveRelationLabel(field, String(relationId), catalog);
                          return (
                            <Badge key={String(relationId)} color={resolveRelationColor(label)}>
                              {label}
                            </Badge>
                          );
                        })}
                      </div>
                    </div>
                  );
                }

                const display = getFieldDisplayValue(record, field, database, catalog);
                if (!display) return null;
                return (
                  <div key={field.id} className="db-gallery-field">
                    <span className="db-gallery-field-name">{field.name}</span>
                    <span className="db-gallery-field-value">{display}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
        })}
        <button
          type="button"
          className="db-gallery-add-card"
          onClick={onCreateRecord}
        >
          <div className="db-gallery-add-card-inner">
            <Plus className="h-5 w-5" />
            <span>New record</span>
          </div>
        </button>
      </div>
    </div>
  );
}

function ImageUploadButton({
  record,
  coverField,
  hasImage,
  onUpdateField,
}: {
  record: WorkspaceDatabaseModel["records"][number];
  coverField: WorkspaceDatabaseField;
  hasImage: boolean;
  onUpdateField: (recordId: string, fieldId: string, value: WorkspaceDatabaseFieldValue) => Promise<void> | void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function handleFileChange(file: File | null) {
    if (!file) return;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    void onUpdateField(record.id, coverField.id, dataUrl);
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void handleFileChange(e.target.files?.[0] ?? null)}
      />
      <button
        type="button"
        className="db-gallery-cover-btn"
        onClick={(e) => {
          e.stopPropagation();
          fileInputRef.current?.click();
        }}
      >
        {hasImage ? "Replace image" : "Upload image"}
      </button>
    </>
  );
}
