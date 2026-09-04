import { forwardRef } from "react";

import { Control, controlVariants, type ControlProps } from "@/components/ui/control";

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "selected" | "destructive" | "accent-soft" | "accent-outline";
type ButtonSize = "default" | "sm" | "lg" | "icon";

const variants: Record<ButtonVariant, ControlProps["variant"]> = {
  primary: "primary",
  secondary: "default",
  outline: "quiet",
  ghost: "quiet",
  selected: "selected",
  destructive: "danger",
  "accent-soft": "primary",
  "accent-outline": "default",
};

const sizes: Record<ButtonSize, ControlProps["size"]> = {
  default: "default",
  sm: "sm",
  lg: "default",
  icon: "icon",
};

export interface ButtonProps
  extends Omit<ControlProps, "variant" | "size"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function buttonVariants({
  variant = "primary",
  size = "default",
  className,
}: Pick<ButtonProps, "variant" | "size" | "className"> = {}) {
  return controlVariants({ variant: variants[variant], size: sizes[size], className });
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "default", ...props }, ref) => (
    <Control ref={ref} variant={variants[variant]} size={sizes[size]} {...props} />
  ),
);

Button.displayName = "Button";
