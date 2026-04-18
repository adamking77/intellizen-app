import { toast as sonner } from "sonner";

type ToastOpts = {
  description?: string;
};

export const toast = {
  success: (message: string, opts?: ToastOpts) => sonner.success(message, opts),
  error: (message: string, opts?: ToastOpts) => sonner.error(message, opts),
  info: (message: string, opts?: ToastOpts) => sonner.message(message, opts),
};

export function toastError(prefix: string, err: unknown) {
  const description =
    err instanceof Error
      ? err.message
      : typeof err === "object" && err !== null && "message" in err
        ? String((err as { message: unknown }).message)
        : String(err);
  sonner.error(prefix, { description });
}
