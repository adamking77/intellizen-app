import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "Undated";

  const date = new Date(value);
  const timestamp = date.getTime();
  if (!Number.isFinite(timestamp)) return "Undated";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(timestamp);
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "Never";

  const date = new Date(value);
  const timestamp = date.getTime();
  if (!Number.isFinite(timestamp)) return "Never";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(timestamp);
}

export function safeHostname(value: string) {
  try {
    return new URL(value).hostname;
  } catch {
    return value;
  }
}

export function summarizeText(value: string | null | undefined, max = 180) {
  if (!value) return null;
  if (value.length <= max) return value;
  return `${value.slice(0, max).trim()}...`;
}
