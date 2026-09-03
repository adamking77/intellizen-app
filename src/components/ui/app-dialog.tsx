import { Dialog } from "@base-ui/react/dialog";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface AppDialogProps {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  onOpenChange: (open: boolean) => void;
  className?: string;
}

/**
 * Keyboard-complete application dialog. Base UI owns Escape, focus trapping,
 * outside-click dismissal, and focus restoration so feature dialogs do not
 * have to reimplement those contracts.
 */
export function AppDialog({
  open,
  title,
  description,
  children,
  footer,
  onOpenChange,
  className,
}: AppDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="modal-backdrop fixed inset-0 z-[120]" />
        <Dialog.Viewport className="fixed inset-0 z-[121] flex items-center justify-center p-3">
          <Dialog.Popup
            className={cn(
              "modal-surface flex max-h-[86dvh] min-w-[320px] max-w-[min(560px,calc(100vw-24px))] flex-col overflow-hidden",
              className,
            )}
          >
            <header className="shrink-0 px-[19px] pb-2 pt-[17px]">
              <Dialog.Title className="font-ui text-[var(--t-ui)] font-medium text-[var(--text)]">
                {title}
              </Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-1 font-ui text-[var(--t-meta)] leading-[1.45] text-[var(--text-muted)]">
                  {description}
                </Dialog.Description>
              ) : null}
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-[19px] py-3">{children}</div>
            {footer ? (
              <footer className="flex shrink-0 justify-end gap-2 px-[19px] pb-[17px] pt-2">
                {footer}
              </footer>
            ) : null}
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
