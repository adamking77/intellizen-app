import { AppDialog } from "@/components/ui/app-dialog";
import { Control } from "@/components/ui/control";

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
    <AppDialog
      open={open}
      role="alertdialog"
      title={title}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onCancel();
      }}
      className="w-[min(372px,calc(100vw-24px))]"
      footer={
        <>
          <Control size="sm" onClick={onCancel}>Cancel</Control>
          <Control size="sm" variant={danger ? "danger" : "primary"} onClick={onConfirm}>
            {confirmLabel}
          </Control>
        </>
      }
    >
      <p className="font-ui text-[var(--t-meta)] leading-[1.45] text-[var(--text-muted)]">{message}</p>
    </AppDialog>
  );
}
