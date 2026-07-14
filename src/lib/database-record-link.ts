export function withDatabaseRecordParam(current: URLSearchParams, recordId: string | null) {
  const next = new URLSearchParams(current);
  const normalized = recordId?.trim() ?? "";
  if (normalized) next.set("record", normalized);
  else next.delete("record");
  return next;
}
