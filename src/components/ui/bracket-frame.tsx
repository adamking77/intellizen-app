import { cn } from "@/lib/utils";

interface BracketFrameProps extends React.HTMLAttributes<HTMLDivElement> {
  color?: string;
  length?: number;
}

/**
 * Decorative corner-bracket wrapper. Draws ┌ ┐ └ ┘ at each corner of the
 * wrapped box in a 1px line. Use sparingly as a section framer on analytical
 * screens (e.g. active phase on the Investigate stepper).
 */
export function BracketFrame({
  color = "rgba(127, 132, 156, 0.4)",
  length = 8,
  className,
  children,
  ...props
}: BracketFrameProps) {
  const common: React.CSSProperties = {
    position: "absolute",
    width: length,
    height: length,
    borderColor: color,
    borderStyle: "solid",
    borderWidth: 0,
  };

  return (
    <div className={cn("relative", className)} {...props}>
      <span
        aria-hidden
        style={{
          ...common,
          top: 0,
          left: 0,
          borderTopWidth: 1,
          borderLeftWidth: 1,
        }}
      />
      <span
        aria-hidden
        style={{
          ...common,
          top: 0,
          right: 0,
          borderTopWidth: 1,
          borderRightWidth: 1,
        }}
      />
      <span
        aria-hidden
        style={{
          ...common,
          bottom: 0,
          left: 0,
          borderBottomWidth: 1,
          borderLeftWidth: 1,
        }}
      />
      <span
        aria-hidden
        style={{
          ...common,
          bottom: 0,
          right: 0,
          borderBottomWidth: 1,
          borderRightWidth: 1,
        }}
      />
      {children}
    </div>
  );
}
