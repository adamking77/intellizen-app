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
        <Dialog.Backdrop className="fixed inset-0 z-[120] bg-[color-mix(in_srgb,var(--crust)_72%,transparent)]" />
        <Dialog.Viewport className="fixed inset-0 z-[121] flex items-center justify-center px-4 py-6">
          <Dialog.Popup
            className={cn(
              "max-h-full min-w-[320px] max-w-[min(560px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--mantle)] outline-none",
              className,
            )}
            style={{ boxShadow: "var(--shadow-elevated)" }}
          >
            <header className="border-b border-[var(--border-subtle)] px-5 py-4">
              <Dialog.Title className="font-ui text-[16px] font-semibold text-[var(--text)]">
                {title}
              </Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-1 font-ui text-[13px] leading-5 text-[var(--subtext-0)]">
                  {description}
                </Dialog.Description>
              ) : null}
            </header>
            <div className="max-h-[min(70vh,720px)] overflow-y-auto px-5 py-4">{children}</div>
            {footer ? (
              <footer className="flex justify-end gap-2 border-t border-[var(--border-subtle)] px-5 py-4">
                {footer}
              </footer>
            ) : null}
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
