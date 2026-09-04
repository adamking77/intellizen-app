import { forwardRef, type SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const selectVariants = cva(
  "block h-[var(--h-ctl)] w-full appearance-none rounded-[var(--r-ctl)] border border-transparent bg-[var(--input)] " +
    "font-ui text-[var(--text)] transition-[border-color,background-color] duration-[var(--t-base)] ease-[var(--ease)] " +
    "focus-visible:border-[var(--line-strong)] disabled:cursor-not-allowed disabled:opacity-[.45]",
  {
    variants: {
      controlSize: {
        xs: "px-2.5 pr-7 text-[var(--t-meta)]",
        sm: "px-2.5 pr-7 text-[var(--t-meta)]",
        default: "px-3 pr-8 text-[var(--t-ui)]",
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
      <select ref={ref} data-select-chevron="custom" className={cn(selectVariants({ controlSize, className }))} {...props}>
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
