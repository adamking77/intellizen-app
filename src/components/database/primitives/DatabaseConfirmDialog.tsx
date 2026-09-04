import { DatabaseButton } from "@/components/database/primitives/DatabaseButton";
import { DatabaseDialog } from "@/components/database/primitives/DatabaseDialog";

interface DatabaseConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DatabaseConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  danger = false,
  onConfirm,
  onCancel,
}: DatabaseConfirmDialogProps) {
  return (
    <DatabaseDialog
      open={open}
      role="alertdialog"
      title={title}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onCancel();
      }}
      className="w-[min(420px,calc(100vw-2rem))]"
      footer={
        <>
          <DatabaseButton variant="secondary" size="sm" onClick={onCancel}>Cancel</DatabaseButton>
          <DatabaseButton variant={danger ? "destructive" : "primary"} size="sm" onClick={onConfirm}>
            {confirmLabel}
          </DatabaseButton>
        </>
      }
    >
      <p className="text-[13px] leading-5 text-[var(--subtext-0)]">{message}</p>
    </DatabaseDialog>
  );
}
