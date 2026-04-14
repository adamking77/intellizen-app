import { cn } from "@/lib/utils";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "glass" | "hud" | "elevated";
  interactive?: boolean;
}

/**
 * Flat, glow-free card. 1px border, 12px radius, Surface0 bg.
 * Variant kept for API compatibility; all variants now render identically.
 */
export function Card({
  className,
  variant = "default",
  interactive = false,
  ...props
}: CardProps) {
  void variant;
  return (
    <div
      className={cn(
        "bg-[var(--base)] border border-[var(--border)] rounded-xl",
        interactive &&
          "transition-colors duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-[var(--border-strong)] cursor-pointer",
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-col space-y-1.5 px-5 pt-5 pb-3", className)}
      {...props}
    />
  );
}

export function CardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn(
        "font-ui text-[18px] font-semibold tracking-[-0.01em] text-[var(--text)]",
        className
      )}
      {...props}
    />
  );
}

export function CardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("text-[13px] text-[var(--subtext-0)]", className)}
      {...props}
    />
  );
}

export function CardContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 pb-5 pt-0", className)} {...props} />;
}

export function CardFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center px-5 pb-5 pt-0 border-t border-[var(--border-subtle)]",
        className
      )}
      {...props}
    />
  );
}
