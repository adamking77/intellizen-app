import { forwardRef, type SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const selectVariants = cva(
  "block w-full appearance-none rounded-lg border border-[var(--border)] bg-[var(--mantle)] " +
    "font-ui text-[var(--text)] transition-[border-color,box-shadow,background-color] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] " +
    "focus:outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_1px_var(--accent-border)] " +
    "disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      controlSize: {
        xs: "h-7 px-2.5 pr-7 text-[12px]",
        sm: "h-8 px-2.5 pr-7 text-[12px]",
        default: "h-9 px-3 pr-8 text-[13px]",
      },
    },
    defaultVariants: {
      controlSize: "default",
    },
  },
);

export interface SelectProps
  extends SelectHTMLAttributes<HTMLSelectElement>,
    VariantProps<typeof selectVariants> {
  containerClassName?: string;
  hideChevron?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, containerClassName, controlSize, hideChevron = false, children, ...props }, ref) => (
    <span className={cn("relative inline-flex min-w-0", containerClassName)}>
      <select ref={ref} className={cn(selectVariants({ controlSize, className }))} {...props}>
        {children}
      </select>
      {!hideChevron ? (
        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--overlay-1)]"
        />
      ) : null}
    </span>
  ),
);

Select.displayName = "Select";

export { selectVariants };
