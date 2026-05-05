const STORAGE_KEY = "intelizen:current-database-id";

export function loadCurrentDatabaseId() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

export function saveCurrentDatabaseId(databaseId: string | null) {
  if (typeof window === "undefined") return;
  if (!databaseId) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, databaseId);
}
