import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

// Buttons in the prototype's style: round pills; black for the main action, white with a fine border
// for the others. buttonClass() gives the same look to links.

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg" | "icon";

const base =
  "inline-flex items-center justify-center gap-1.5 rounded-full font-semibold whitespace-nowrap transition-[background-color,border-color,color,transform,opacity] duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";

const variants: Record<Variant, string> = {
  primary: "bg-ink text-white hover:bg-ink/85",
  secondary: "bg-surface text-ink border border-line hover:bg-raised",
  ghost: "text-ink-2 hover:text-ink hover:bg-raised",
  danger: "bg-danger text-white hover:bg-danger/90",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-4 text-sm",
  lg: "h-11 px-5 text-sm",
  icon: "size-9 text-sm",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra = ""): string {
  return `${base} ${variants[variant]} ${sizes[size]} ${extra}`;
}

// ComponentProps includes `ref` (React 19 passes it like any other prop).
type ButtonProps = ComponentProps<"button"> & { variant?: Variant; size?: Size; children: ReactNode };

export function Button({ variant = "primary", size = "md", className = "", type = "button", ...rest }: ButtonProps) {
  return <button type={type} className={buttonClass(variant, size, className)} {...rest} />;
}

type LinkButtonProps = ComponentProps<typeof Link> & { variant?: Variant; size?: Size };

export function LinkButton({ variant = "primary", size = "md", className = "", ...rest }: LinkButtonProps) {
  return <Link className={buttonClass(variant, size, className)} {...rest} />;
}
