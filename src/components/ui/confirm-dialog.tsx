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
        <AlertDialog.Backdrop className="modal-backdrop fixed inset-0 z-[120]" />
        <AlertDialog.Viewport className="fixed inset-0 z-[121] flex items-center justify-center p-3">
          <AlertDialog.Popup
            className="modal-surface w-[min(372px,calc(100vw-24px))] overflow-hidden"
          >
            <div className="px-[19px] pt-[17px]">
              <AlertDialog.Title className="font-ui text-[var(--t-ui)] font-medium text-[var(--text)]">
                {title}
              </AlertDialog.Title>
            </div>
            <div className="px-[19px] pt-[5px]">
              <AlertDialog.Description className="font-ui text-[var(--t-meta)] leading-[1.45] text-[var(--text-muted)]">
                {message}
              </AlertDialog.Description>
            </div>
            <div className="flex justify-end gap-2 px-[19px] pb-[17px] pt-3.5">
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
