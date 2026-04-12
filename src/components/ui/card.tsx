import { cn } from "@/lib/utils";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "glass" | "hud" | "elevated";
}

export function Card({
  className,
  variant = "default",
  ...props
}: CardProps) {
  const variants = {
    default: "bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-[var(--shadow)]",
    glass: "bg-[var(--surface-glass)] border border-[var(--border)] rounded-2xl backdrop-blur-xl shadow-[var(--shadow-lg)]",
    hud: "bg-gradient-to-b from-[var(--panel)] to-[rgba(15,21,28,0.98)] border border-[var(--border)] rounded-xl relative overflow-hidden",
    elevated: "bg-[var(--surface-strong)] border border-[var(--border-strong)] rounded-2xl shadow-[var(--shadow-lg)]",
  };

  return (
    <div
      className={cn(variants[variant], className)}
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
      className={cn("flex flex-col space-y-1.5 p-6", className)}
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
      className={cn("text-lg font-semibold tracking-tight text-[var(--foreground)]", className)}
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
      className={cn("text-sm text-[var(--foreground-muted)]", className)}
      {...props}
    />
  );
}

export function CardContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6 pt-0", className)} {...props} />;
}

export function CardFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-center p-6 pt-0", className)}
      {...props}
    />
  );
}
