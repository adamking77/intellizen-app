import { toast as sonner } from "sonner";

type ToastOpts = {
  description?: string;
  action?: { label: string; onClick: () => void };
};

export const toast = {
  success: (message: string, opts?: ToastOpts) => sonner.success(message, opts),
  error: (message: string, opts?: ToastOpts) => sonner.error(message, opts),
  info: (message: string, opts?: ToastOpts) => sonner.message(message, opts),
};

export function errorMessage(err: unknown) {
  if (err instanceof Error) return err.message;
  if (typeof err !== "object" || err === null) {
    const text = String(err);
    return text === "[object Object]"
      ? "Request failed without diagnostic detail."
      : text;
  }
  const record = err as Record<string, unknown>;
  const message =
    typeof record.message === "string" ? record.message.trim() : "";
  const code = typeof record.code === "string" ? record.code.trim() : "";
  if (message) return code && code !== message ? `${message} · ${code}` : message;
  const details = ["details", "hint"].flatMap((key) => {
    const value = record[key];
    return typeof value === "string" && value.trim()
      ? [value.trim().split("\n")[0]]
      : [];
  });
  if (details.length) return [...new Set(details)].join(" · ");
  try {
    return JSON.stringify(record);
  } catch {
    return "Unknown error";
  }
}

export function toastError(prefix: string, err: unknown) {
  sonner.error(prefix, { description: errorMessage(err) });
}
