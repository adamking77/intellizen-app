import type {
  WorkspaceDatabaseCatalogEntry,
  WorkspaceDatabaseField,
  WorkspaceDatabaseFieldValue,
  WorkspaceDatabaseModel,
  WorkspaceDatabaseRecordModel,
} from "@/lib/types";

export const STATUS_OPTIONS = ["Not started", "In progress", "Done"] as const;

export const DEFAULT_OPTION_COLORS = [
  "#6b7280",
  "#8b6b4a",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#a855f7",
  "#ef4444",
];

const READ_ONLY_IMPORT_TYPES = new Set(["formula", "rollup", "createdAt", "lastEditedAt"]);

export interface DatabaseCsvImportResult {
  records: Array<{ id: string; fields: Record<string, WorkspaceDatabaseFieldValue> }>;
  matchedFieldNames: string[];
  ignoredHeaders: string[];
  readOnlyHeaders: string[];
  skippedRows: number;
  totalRows: number;
}

export function getFieldValue(
  record: WorkspaceDatabaseRecordModel,
  field: WorkspaceDatabaseField,
  database?: Pick<WorkspaceDatabaseModel, "schema" | "records">,
  catalog?: WorkspaceDatabaseCatalogEntry[],
  seen = new Set<string>(),
): WorkspaceDatabaseFieldValue {
  const seenKey = `${record.id}:${field.id}`;
  if (seen.has(seenKey)) {
    return null;
  }

  if (field.type === "createdAt") {
    return record._createdAt ?? null;
  }

  if (field.type === "lastEditedAt") {
    return record._updatedAt ?? null;
  }

  if (field.type === "formula" && database) {
    return computeFormulaValue(record, field, database, catalog, new Set([...seen, seenKey]));
  }

  if (field.type === "rollup" && database) {
    return computeRollupValue(record, field, database, catalog, new Set([...seen, seenKey]));
  }

  return record[field.id];
}

export function getFieldDisplayValue(
  record: WorkspaceDatabaseRecordModel,
  field: WorkspaceDatabaseField,
  database?: Pick<WorkspaceDatabaseModel, "schema" | "records">,
  catalog?: WorkspaceDatabaseCatalogEntry[],
): string {
  const value = getFieldValue(record, field, database, catalog);
  if (value === null || value === undefined || value === "") {
    return "";
  }

  if (field.type === "checkbox") {
    return value ? "True" : "False";
  }

  if (field.type === "relation" && Array.isArray(value)) {
    return value.map((relationId) => resolveRelationLabel(field, relationId, catalog)).join(", ");
  }

  if (Array.isArray(value)) {
    return value.join(", ");
  }

  return String(value);
}

export function getRecordTitle(
  record: WorkspaceDatabaseRecordModel,
  database: Pick<WorkspaceDatabaseModel, "schema" | "headerFieldIds" | "records">,
): string {
  const configured = getPrimaryTitleField(database);
  const fallback =
    configured ??
    database.schema.find((field) => field.type === "text") ??
    database.schema.find((field) => field.type !== "createdAt" && field.type !== "lastEditedAt");

  if (!fallback) {
    return "Untitled";
  }

  const value = getFieldValue(record, fallback, database);
  if (value === null || value === undefined || value === "") {
    return "Untitled";
  }

  return Array.isArray(value) ? value.join(", ") : String(value);
}

export function getPrimaryTitleField(
  database: Pick<WorkspaceDatabaseModel, "schema" | "headerFieldIds">,
) {
  const configuredId = database.headerFieldIds?.[0];
  return configuredId ? database.schema.find((field) => field.id === configuredId) : undefined;
}

export function getSuggestedHeaderFields(
  database: Pick<WorkspaceDatabaseModel, "schema" | "headerFieldIds">,
) {
  const titleField =
    getPrimaryTitleField(database) ??
    database.schema.find((field) => field.type === "text") ??
    database.schema.find((field) => field.type !== "createdAt" && field.type !== "lastEditedAt");

  const scoredFields = database.schema
    .filter((field) => field.id !== titleField?.id)
    .map((field) => {
      let score = 0;
      if (field.type === "status") score += 36;
      if (field.type === "select") score += 30;
      if (field.type === "relation") score += 24;
      if (field.type === "date") score += 20;
      if (field.type === "multiselect") score += 16;
      if (field.type === "checkbox") score += 12;
      if (/status|stage|priority|state/i.test(field.name)) score += 14;
      if (field.type === "relation" && /tasks?|subtasks?|children/i.test(field.name)) score -= 30;
      return { field, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.field.name.localeCompare(right.field.name))
    .slice(0, titleField ? 4 : 5)
    .map((entry) => entry.field.id);

  return titleField ? [titleField.id, ...scoredFields] : scoredFields;
}

export function getVisibleFields(
  schema: WorkspaceDatabaseField[],
  view: WorkspaceDatabaseModel["views"][number],
) {
  const order = view.fieldOrder ?? schema.map((field) => field.id);
  const orderSet = new Set(order);
  const appended = schema.map((field) => field.id).filter((id) => !orderSet.has(id));
  const hidden = new Set(view.hiddenFields ?? []);
  return [...order, ...appended]
    .map((id) => schema.find((field) => field.id === id))
    .filter((field): field is WorkspaceDatabaseField => {
      if (!field) return false;
      return !hidden.has(field.id);
    });
}

export function getViewRecords(
  database: Pick<WorkspaceDatabaseModel, "records" | "schema">,
  view: Pick<WorkspaceDatabaseModel["views"][number], "filter" | "sort">,
  catalog?: WorkspaceDatabaseCatalogEntry[],
) {
  return applySorts(applyFilters(database.records, view.filter, database.schema, catalog), view.sort, database.schema);
}

export function findDefaultKanbanField(
  database: Pick<WorkspaceDatabaseModel, "schema">,
) {
  return (
    database.schema.find((field) => field.type === "status") ??
    database.schema.find((field) => field.type === "select")
  );
}

export function findDefaultDateField(
  database: Pick<WorkspaceDatabaseModel, "schema">,
) {
  return database.schema.find((field) => field.type === "date");
}

export function getChartGroupCandidates(
  database: Pick<WorkspaceDatabaseModel, "schema">,
  chartType: WorkspaceDatabaseModel["views"][number]["chartType"] = "bar",
) {
  return database.schema.filter((field) => {
    if (chartType === "line") {
      return field.type === "date" || field.type === "createdAt" || field.type === "lastEditedAt";
    }

    if (chartType === "donut") {
      return (
        field.type === "status" ||
        field.type === "select" ||
        field.type === "multiselect" ||
        field.type === "relation" ||
        field.type === "checkbox"
      );
    }

    return (
      field.type === "status" ||
      field.type === "select" ||
      field.type === "multiselect" ||
      field.type === "relation" ||
      field.type === "checkbox" ||
      field.type === "date" ||
      field.type === "createdAt" ||
      field.type === "lastEditedAt" ||
      field.type === "text"
    );
  });
}

export function findDefaultChartGroupField(
  database: Pick<WorkspaceDatabaseModel, "schema">,
  chartType: WorkspaceDatabaseModel["views"][number]["chartType"] = "bar",
) {
  const candidates = getChartGroupCandidates(database, chartType);
  return (
    candidates.find((field) => field.type === "status") ??
    candidates.find((field) => field.type === "select") ??
    candidates.find((field) => field.type === "date") ??
    candidates.find((field) => field.type === "createdAt") ??
    candidates.find((field) => field.type === "lastEditedAt") ??
    candidates.find((field) => field.type === "relation") ??
    candidates.find((field) => field.type === "multiselect") ??
    candidates.find((field) => field.type === "checkbox") ??
    candidates.find((field) => field.type === "text") ??
    candidates[0]
  );
}

export function findDefaultChartValueField(
  database: Pick<WorkspaceDatabaseModel, "schema">,
) {
  return (
    database.schema.find((field) => field.type === "number") ??
    database.schema.find((field) => field.type === "rollup") ??
    database.schema.find((field) => field.type === "formula")
  );
}

export function exportDatabaseCsv(
  database: Pick<WorkspaceDatabaseModel, "schema" | "records" | "headerFieldIds">,
  catalog?: WorkspaceDatabaseCatalogEntry[],
) {
  const headers = ["id", ...database.schema.map((field) => field.name)];
  const rows = [headers.map(csvEscape).join(",")];

  for (const record of database.records) {
    const cells = [
      csvEscape(record.id),
      ...database.schema.map((field) => {
        const value = getFieldValue(record, field, database, catalog);
        if (value === null || value === undefined) return "";
        if (Array.isArray(value)) return csvEscape(value.join(";"));
        return csvEscape(String(value));
      }),
    ];
    rows.push(cells.join(","));
  }

  return rows.join("\r\n");
}

export function importCsvRecords(
  database: Pick<WorkspaceDatabaseModel, "schema">,
  csvText: string,
) {
  return prepareCsvImport(database, csvText).records;
}

export function prepareCsvImport(
  database: Pick<WorkspaceDatabaseModel, "schema">,
  csvText: string,
): DatabaseCsvImportResult {
  const rows = parseCsvText(csvText);
  if (rows.length < 2) {
    return {
      records: [],
      matchedFieldNames: [],
      ignoredHeaders: [],
      readOnlyHeaders: [],
      skippedRows: 0,
      totalRows: Math.max(rows.length - 1, 0),
    };
  }

  const headers = rows[0].map((header) => header.trim());
  const fieldMap = new Map(
    database.schema.map((field) => [field.name.trim().toLowerCase(), field]),
  );
  const matchedColumns: Array<{ columnIndex: number; field: WorkspaceDatabaseField; header: string }> = [];
  const ignoredHeaders: string[] = [];
  const readOnlyHeaders: string[] = [];

  headers.forEach((header, columnIndex) => {
    const normalizedHeader = header.trim().toLowerCase();
    if (!normalizedHeader || normalizedHeader === "id") return;

    const field = fieldMap.get(normalizedHeader);
    if (!field) {
      ignoredHeaders.push(header);
      return;
    }

    if (READ_ONLY_IMPORT_TYPES.has(field.type)) {
      readOnlyHeaders.push(header);
      return;
    }

    matchedColumns.push({ columnIndex, field, header });
  });

  if (!matchedColumns.length) {
    throw new Error("CSV headers did not match any editable database fields.");
  }

  const records: Array<{ id: string; fields: Record<string, WorkspaceDatabaseFieldValue> }> = [];
  let skippedRows = 0;
  const issues: string[] = [];

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const fields: Record<string, WorkspaceDatabaseFieldValue> = {};
    let hasImportedValue = false;

    for (const { columnIndex, field, header } of matchedColumns) {
      const raw = row[columnIndex] ?? "";
      const parsed = coerceCsvValue(field, raw);
      if (parsed.issue) {
        issues.push(`Row ${rowIndex + 1} · ${header}: ${parsed.issue}`);
        continue;
      }
      if (!isImportValueEmpty(parsed.value)) {
        fields[field.id] = parsed.value;
        hasImportedValue = true;
      }
    }

    if (!hasImportedValue) {
      skippedRows += 1;
      continue;
    }

    records.push({ id: crypto.randomUUID(), fields });
  }

  if (issues.length) {
    throw new Error(
      `CSV import has invalid cells:\n${issues.slice(0, 6).join("\n")}${issues.length > 6 ? "\n…" : ""}`,
    );
  }

  return {
    records,
    matchedFieldNames: matchedColumns.map((column) => column.field.name),
    ignoredHeaders,
    readOnlyHeaders,
    skippedRows,
    totalRows: rows.length - 1,
  };
}

export function getComputedFieldIssue(
  field: WorkspaceDatabaseField,
  database: Pick<WorkspaceDatabaseModel, "schema" | "records">,
  catalog?: WorkspaceDatabaseCatalogEntry[],
) {
  if (field.type === "formula") {
    const expression = field.formula?.expression?.trim();
    if (!expression) return "Formula is empty.";

    const references = [...expression.matchAll(/\{([^}]+)\}/g)].map((match) => match[1].trim());
    for (const reference of references) {
      if (!database.schema.some((candidate) => candidate.id === reference)) {
        return `Unknown field reference: ${reference}`;
      }
    }

    try {
      const sample = database.records[0] ?? ({ id: "preview" } as WorkspaceDatabaseRecordModel);
      computeFormulaValue(sample, field, database, catalog);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }

  if (field.type === "rollup") {
    const relationFieldId = field.rollup?.relationFieldId;
    if (!relationFieldId) return "Choose a relation field.";

    const relationField = database.schema.find(
      (candidate) => candidate.id === relationFieldId && candidate.type === "relation",
    );
    if (!relationField) return "Relation field is missing.";

    if (field.rollup?.aggregation !== "count" && !field.rollup?.targetFieldId) {
      return "Choose a target field for this aggregation.";
    }

    if (field.rollup?.targetFieldId) {
      const targetDbId = relationField.relation?.targetDatabaseId;
      const targetDb =
        (targetDbId ? catalog?.find((entry) => entry.id === targetDbId) : undefined) ?? {
          schema: database.schema,
          records: database.records,
          id: "",
          name: "",
          headerFieldIds: [],
          views: [],
        };
      if (!targetDb.schema.some((candidate) => candidate.id === field.rollup?.targetFieldId)) {
        return "Target field is missing on the related database.";
      }
    }

    return null;
  }

  return null;
}

export function getKanbanColumns(
  database: Pick<WorkspaceDatabaseModel, "schema">,
  view: Pick<WorkspaceDatabaseModel["views"][number], "groupBy">,
  records: WorkspaceDatabaseRecordModel[],
) {
  const groupField =
    (view.groupBy ? database.schema.find((field) => field.id === view.groupBy) : undefined) ??
    findDefaultKanbanField(database);

  if (!groupField || (groupField.type !== "status" && groupField.type !== "select")) {
    return { groupField: null, columns: [] as Array<{ value: string; label: string; records: WorkspaceDatabaseRecordModel[] }> };
  }

  const options =
    groupField.type === "status" ? [...STATUS_OPTIONS] : [...(groupField.options ?? [])];
  const columns = [
    { value: "", label: "No value", records: [] as WorkspaceDatabaseRecordModel[] },
    ...options.map((option) => ({ value: option, label: option, records: [] as WorkspaceDatabaseRecordModel[] })),
  ];

  for (const record of records) {
      const value = String(getFieldValue(record, groupField) ?? "");
      // getFieldValue uses raw status/select values for grouping, so no db context needed here.
      const column = columns.find((candidate) => candidate.value === value) ?? columns[0];
      column.records.push(record);
  }

  return {
    groupField,
    columns: columns.filter((column) => column.records.length > 0 || column.value !== ""),
  };
}

export function applyFilters(
  records: WorkspaceDatabaseRecordModel[],
  filters: WorkspaceDatabaseModel["views"][number]["filter"],
  schema: WorkspaceDatabaseField[],
  catalog?: WorkspaceDatabaseCatalogEntry[],
) {
  if (!filters.length) {
    return records;
  }

  return records.filter((record) =>
    filters.every((filter) => {
      const field = schema.find((candidate) => candidate.id === filter.fieldId);
      if (!field) {
        const fallbackValue = record[filter.fieldId];
        const fallbackString = valueAsFilterString(fallbackValue);
        return filter.op === "contains" ? fallbackString.includes(filter.value.toLowerCase()) : true;
      }

      const database = { schema, records };
      const value = getFieldValue(record, field, database, catalog);
      const stringValue = valueAsFilterString(getFieldDisplayValue(record, field, database, catalog));
      const filterValue = filter.value.toLowerCase();

      switch (filter.op) {
        case "contains":
          return stringValue.includes(filterValue);
        case "not_contains":
          return !stringValue.includes(filterValue);
        case "equals":
          return stringValue === filterValue;
        case "not_equals":
          return stringValue !== filterValue;
        case "is_empty":
          return value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
        case "is_not_empty":
          return !(
            value === null ||
            value === undefined ||
            value === "" ||
            (Array.isArray(value) && value.length === 0)
          );
        case "gt":
          return Number(value) > Number(filter.value);
        case "gte":
          return Number(value) >= Number(filter.value);
        case "lt":
          return Number(value) < Number(filter.value);
        case "lte":
          return Number(value) <= Number(filter.value);
        default:
          return true;
      }
    }),
  );
}

export function applySorts(
  records: WorkspaceDatabaseRecordModel[],
  sorts: WorkspaceDatabaseModel["views"][number]["sort"],
  schema: WorkspaceDatabaseField[],
) {
  if (!sorts.length) {
    return records;
  }

  return [...records].sort((left, right) => {
    for (const sort of sorts) {
      const field = schema.find((candidate) => candidate.id === sort.fieldId);
      const leftValue = field ? getFieldValue(left, field, { schema, records }) : left[sort.fieldId];
      const rightValue = field ? getFieldValue(right, field, { schema, records }) : right[sort.fieldId];
      const comparison = compareValues(leftValue, rightValue);
      if (comparison !== 0) {
        return sort.direction === "asc" ? comparison : -comparison;
      }
    }

    return 0;
  });
}

export function relationTargetDatabaseId(
  field: WorkspaceDatabaseField,
  currentDatabaseId: string,
) {
  return field.relation?.targetDatabaseId ?? currentDatabaseId;
}

export function resolveRelationLabel(
  field: WorkspaceDatabaseField,
  recordId: string,
  catalog?: WorkspaceDatabaseCatalogEntry[],
) {
  if (!catalog?.length) {
    return recordId;
  }

  const targetDatabaseId = field.relation?.targetDatabaseId;
  const databases = targetDatabaseId
    ? catalog.filter((entry) => entry.id === targetDatabaseId)
    : catalog;

  for (const database of databases) {
    const record = database.records.find((candidate) => candidate.id === recordId);
    if (!record) continue;
    return getRecordTitle(record, database);
  }

  return recordId;
}

function computeFormulaValue(
  record: WorkspaceDatabaseRecordModel,
  field: WorkspaceDatabaseField,
  database: Pick<WorkspaceDatabaseModel, "schema" | "records">,
  catalog?: WorkspaceDatabaseCatalogEntry[],
  seen = new Set<string>(),
): string | number | null {
  let expression = field.formula?.expression?.trim();
  if (!expression) return null;
  if (expression.startsWith("=")) expression = expression.slice(1).trim();

  const functionMatch = /^([a-zA-Z_][a-zA-Z0-9_]*)\((.*)\)$/.exec(expression);
  if (functionMatch) {
    const fnName = functionMatch[1].toUpperCase();
    const args = splitFormulaArgs(functionMatch[2]).map((token) =>
      evaluateFormulaToken(token, record, database, catalog, seen),
    );
    return applyFormulaFunction(fnName, args, record, database, catalog, seen);
  }

  const arithmetic = tryEvaluateArithmetic(expression, record, database, catalog, seen);
  if (arithmetic !== null && arithmetic !== undefined) return arithmetic;

  const replaced = expression.replace(/\{([^}]+)\}/g, (_full, fieldId) => {
    const referencedField = database.schema.find((candidate) => candidate.id === String(fieldId).trim());
    if (!referencedField) return "";
    const value = getFieldValue(record, referencedField, database, catalog, seen);
    if (value === null || value === undefined) return "";
    if (Array.isArray(value)) return value.join(", ");
    return String(value);
  });
  const asNumber = Number(replaced);
  return Number.isFinite(asNumber) && replaced !== "" ? asNumber : replaced;
}

function computeRollupValue(
  record: WorkspaceDatabaseRecordModel,
  field: WorkspaceDatabaseField,
  database: Pick<WorkspaceDatabaseModel, "schema" | "records">,
  catalog?: WorkspaceDatabaseCatalogEntry[],
  seen = new Set<string>(),
): number | null {
  const rollup = field.rollup;
  if (!rollup) return null;

  const relationField = database.schema.find(
    (candidate) => candidate.id === rollup.relationFieldId && candidate.type === "relation",
  );
  if (!relationField) return null;

  const rawLinked = record[relationField.id];
  const linkedIds = Array.isArray(rawLinked) ? rawLinked.map((id) => String(id)) : [];
  if (!linkedIds.length) {
    return rollup.aggregation === "count" ? 0 : null;
  }

  const targetDatabaseId = relationTargetDatabaseId(relationField, "");
  const targetDatabase =
    (targetDatabaseId
      ? catalog?.find((entry) => entry.id === targetDatabaseId)
      : undefined) ?? {
      id: "",
      name: "",
      schema: database.schema,
      headerFieldIds: [],
      records: database.records,
      views: [],
    };

  const linkedRecords = targetDatabase.records.filter((candidate) => linkedIds.includes(candidate.id));
  if (!linkedRecords.length) {
    return rollup.aggregation === "count" ? 0 : null;
  }

  if (rollup.aggregation === "count") return linkedRecords.length;

  if (rollup.aggregation === "count_not_empty") {
    if (!rollup.targetFieldId) return 0;
    const targetField = targetDatabase.schema.find((candidate) => candidate.id === rollup.targetFieldId);
    if (!targetField) return 0;

    return linkedRecords.filter((linkedRecord) => {
      const value = getFieldValue(linkedRecord, targetField, targetDatabase, catalog, seen);
      return value !== null && value !== undefined && value !== "" && !(Array.isArray(value) && value.length === 0);
    }).length;
  }

  if (!rollup.targetFieldId) return null;
  const targetField = targetDatabase.schema.find((candidate) => candidate.id === rollup.targetFieldId);
  if (!targetField) return null;

  const values = linkedRecords
    .map((linkedRecord) => Number(getFieldValue(linkedRecord, targetField, targetDatabase, catalog, seen)))
    .filter((value) => Number.isFinite(value));
  if (!values.length) return null;

  switch (rollup.aggregation) {
    case "sum":
      return values.reduce((sum, value) => sum + value, 0);
    case "avg":
      return values.reduce((sum, value) => sum + value, 0) / values.length;
    case "min":
      return Math.min(...values);
    case "max":
      return Math.max(...values);
    default:
      return null;
  }
}

function splitFormulaArgs(args: string): string[] {
  const out: string[] = [];
  let current = "";
  let depth = 0;
  let quote: '"' | "'" | null = null;
  for (let index = 0; index < args.length; index += 1) {
    const char = args[index];
    if ((char === '"' || char === "'") && (!quote || quote === char)) {
      quote = quote ? null : char;
      current += char;
      continue;
    }
    if (!quote) {
      if (char === "(") {
        depth += 1;
        current += char;
        continue;
      }
      if (char === ")") {
        depth = Math.max(0, depth - 1);
        current += char;
        continue;
      }
      if (char === "," && depth === 0) {
        out.push(current.trim());
        current = "";
        continue;
      }
    }
    current += char;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

function evaluateFormulaToken(
  token: string,
  record: WorkspaceDatabaseRecordModel,
  database: Pick<WorkspaceDatabaseModel, "schema" | "records">,
  catalog?: WorkspaceDatabaseCatalogEntry[],
  seen = new Set<string>(),
): string | number | boolean | null {
  const trimmed = token.trim();
  if (!trimmed.length) return null;
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric) && !/[a-zA-Z{}]/.test(trimmed)) return numeric;
  const fieldRef = /^\{([^}]+)\}$/.exec(trimmed);
  if (fieldRef) {
    const referencedField = database.schema.find((field) => field.id === fieldRef[1].trim());
    if (!referencedField) return null;
    const value = getFieldValue(record, referencedField, database, catalog, seen);
    if (Array.isArray(value)) return value.join(", ");
    return value === undefined ? null : (value as string | number | boolean | null);
  }
  const functionMatch = /^([a-zA-Z_][a-zA-Z0-9_]*)\((.*)\)$/.exec(trimmed);
  if (functionMatch) {
    const fnName = functionMatch[1].toUpperCase();
    const args = splitFormulaArgs(functionMatch[2]).map((arg) =>
      evaluateFormulaToken(arg, record, database, catalog, seen),
    );
    return applyFormulaFunction(fnName, args, record, database, catalog, seen);
  }
  const bool = trimmed.toLowerCase();
  if (bool === "true") return true;
  if (bool === "false") return false;
  return trimmed;
}

function applyFormulaFunction(
  name: string,
  args: Array<string | number | boolean | null>,
  record: WorkspaceDatabaseRecordModel,
  database: Pick<WorkspaceDatabaseModel, "schema" | "records">,
  catalog?: WorkspaceDatabaseCatalogEntry[],
  seen = new Set<string>(),
): string | number | null {
  switch (name) {
    case "SUM":
      return numericArgs(args).reduce((sum, value) => sum + value, 0);
    case "AVG": {
      const values = numericArgs(args);
      return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    }
    case "MIN": {
      const values = numericArgs(args);
      return values.length ? Math.min(...values) : 0;
    }
    case "MAX": {
      const values = numericArgs(args);
      return values.length ? Math.max(...values) : 0;
    }
    case "ABS":
      return Math.abs(Number(args[0] ?? 0));
    case "ROUND":
      return Math.round(Number(args[0] ?? 0));
    case "LEN":
      return String(args[0] ?? "").length;
    case "UPPER":
      return String(args[0] ?? "").toUpperCase();
    case "LOWER":
      return String(args[0] ?? "").toLowerCase();
    case "CONCAT":
      return args.map((value) => (value === null || value === undefined ? "" : String(value))).join("");
    case "NOW":
      return new Date().toISOString();
    case "TODAY":
      return new Date().toISOString().slice(0, 10);
    case "IF": {
      const condition = evaluateFormulaCondition(args[0], record, database, catalog, seen);
      return condition
        ? args[1] === null || args[1] === undefined
          ? ""
          : (args[1] as string | number)
        : args[2] === null || args[2] === undefined
          ? ""
          : (args[2] as string | number);
    }
    default:
      return args[0] === null || args[0] === undefined ? null : String(args[0]);
  }
}

function evaluateFormulaCondition(
  raw: string | number | boolean | null,
  record: WorkspaceDatabaseRecordModel,
  database: Pick<WorkspaceDatabaseModel, "schema" | "records">,
  catalog?: WorkspaceDatabaseCatalogEntry[],
  seen = new Set<string>(),
): boolean {
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") return raw !== 0;
  if (raw === null || raw === undefined) return false;

  const condition = String(raw).trim();
  const match = /(.+?)(>=|<=|!=|=|>|<)(.+)/.exec(condition);
  if (!match) return Boolean(condition);
  const left = evaluateFormulaToken(match[1].trim(), record, database, catalog, seen);
  const right = evaluateFormulaToken(match[3].trim(), record, database, catalog, seen);
  const operator = match[2];

  if (typeof left === "number" || typeof right === "number") {
    const leftNumber = Number(left ?? 0);
    const rightNumber = Number(right ?? 0);
    switch (operator) {
      case ">":
        return leftNumber > rightNumber;
      case "<":
        return leftNumber < rightNumber;
      case ">=":
        return leftNumber >= rightNumber;
      case "<=":
        return leftNumber <= rightNumber;
      case "=":
        return leftNumber === rightNumber;
      case "!=":
        return leftNumber !== rightNumber;
      default:
        return false;
    }
  }

  const leftString = String(left ?? "");
  const rightString = String(right ?? "");
  switch (operator) {
    case "=":
      return leftString === rightString;
    case "!=":
      return leftString !== rightString;
    case ">":
      return leftString > rightString;
    case "<":
      return leftString < rightString;
    case ">=":
      return leftString >= rightString;
    case "<=":
      return leftString <= rightString;
    default:
      return false;
  }
}

function numericArgs(args: Array<string | number | boolean | null>) {
  return args.map((value) => Number(value)).filter((value) => Number.isFinite(value));
}

function tryEvaluateArithmetic(
  expression: string,
  record: WorkspaceDatabaseRecordModel,
  database: Pick<WorkspaceDatabaseModel, "schema" | "records">,
  catalog?: WorkspaceDatabaseCatalogEntry[],
  seen = new Set<string>(),
) {
  const replaced = expression.replace(/\{([^}]+)\}/g, (_full, fieldId) => {
    const referencedField = database.schema.find((candidate) => candidate.id === String(fieldId).trim());
    if (!referencedField) return "0";
    const value = Number(getFieldValue(record, referencedField, database, catalog, seen));
    return Number.isFinite(value) ? String(value) : "0";
  });
  if (!/^[0-9+\-*/().\s%]+$/.test(replaced)) return null;
  try {
    const value = Function(`"use strict"; return (${replaced});`)();
    return Number.isFinite(value) ? Number(value) : null;
  } catch {
    return null;
  }
}

function compareValues(left: WorkspaceDatabaseFieldValue, right: WorkspaceDatabaseFieldValue) {
  if ((left === null || left === undefined) && (right === null || right === undefined)) return 0;
  if (left === null || left === undefined) return -1;
  if (right === null || right === undefined) return 1;
  if (typeof left === "number" && typeof right === "number") return left - right;
  if (typeof left === "boolean" && typeof right === "boolean") return Number(left) - Number(right);
  return valueAsFilterString(left).localeCompare(valueAsFilterString(right), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function valueAsFilterString(value: WorkspaceDatabaseFieldValue) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map((item) => String(item)).join(", ").toLowerCase();
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value).toLowerCase();
}

function isImportValueEmpty(value: WorkspaceDatabaseFieldValue) {
  return (
    value === null ||
    value === undefined ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  );
}

function coerceCsvValue(
  field: WorkspaceDatabaseField,
  raw: string,
): { value: WorkspaceDatabaseFieldValue; issue?: string } {
  const trimmed = raw.trim();
  if (field.type === "number") {
    if (trimmed === "") return { value: null };
    const numeric = Number(trimmed);
    if (!Number.isFinite(numeric)) {
      return { value: null, issue: `Expected a number, received "${raw}".` };
    }
    return { value: numeric };
  }
  if (field.type === "checkbox") {
    if (trimmed === "") return { value: null };
    const normalized = trimmed.toLowerCase();
    if (["true", "1", "yes", "y"].includes(normalized)) return { value: true };
    if (["false", "0", "no", "n"].includes(normalized)) return { value: false };
    return { value: null, issue: `Expected true/false, received "${raw}".` };
  }
  if (field.type === "multiselect" || field.type === "relation") {
    return { value: trimmed ? trimmed.split(";").map((item) => item.trim()).filter(Boolean) : [] };
  }
  return { value: trimmed || null };
}

function csvEscape(value: string) {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function parseCsvText(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (char === '"') {
      if (inQuotes && text[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && text[index + 1] === "\n") {
        index += 1;
      }
      row.push(current);
      if (row.some((cell) => cell.trim().length > 0)) {
        rows.push(row);
      }
      row = [];
      current = "";
      continue;
    }

    current += char;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    if (row.some((cell) => cell.trim().length > 0)) {
      rows.push(row);
    }
  }

  return rows;
}
