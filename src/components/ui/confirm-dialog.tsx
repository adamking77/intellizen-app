import { AlertDialog } from "@base-ui/react/alert-dialog";

import { Button } from "@/components/ui/button";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  danger,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onCancel();
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-[120] bg-black/40" />
        <AlertDialog.Viewport className="fixed inset-0 z-[121] flex items-center justify-center px-4">
          <AlertDialog.Popup
            className="min-w-[320px] max-w-[420px] overflow-hidden rounded-2xl bg-[var(--mantle)] outline-none"
            style={{ boxShadow: "var(--shadow-elevated)" }}
          >
            <div className="px-5 py-4">
              <AlertDialog.Title className="text-[16px] font-semibold text-[var(--text)]">
                {title}
              </AlertDialog.Title>
            </div>
            <div className="border-t border-[var(--border-subtle)] px-5 py-4">
              <AlertDialog.Description className="text-[13px] leading-5 text-[var(--subtext-0)]">
                {message}
              </AlertDialog.Description>
            </div>
            <div className="flex justify-end gap-2 border-t border-[var(--border-subtle)] px-5 py-4">
              <Button variant="secondary" size="sm" onClick={onCancel}>
                Cancel
              </Button>
              <Button variant={danger ? "destructive" : "primary"} size="sm" onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Viewport>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
