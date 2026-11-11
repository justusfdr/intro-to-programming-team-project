import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";

const base =
  "inline-flex h-11 items-center justify-center gap-1.5 rounded-full px-5 text-sm font-semibold whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";

const variants: Record<Variant, string> = {
  // Black pill: the main button of a page.
  primary: "bg-ink text-white hover:bg-ink/85",
  // White pill with a fine border.
  secondary: "bg-surface text-ink border border-line hover:bg-raised",
  ghost: "text-ink-2 hover:text-ink hover:bg-raised",
};

// ComponentProps includes `ref` (React 19 passes it like any other prop).
type ButtonProps = ComponentProps<"button"> & { variant?: Variant; children: ReactNode };

export function Button({ variant = "primary", className = "", type = "button", ...rest }: ButtonProps) {
  return <button type={type} className={`${base} ${variants[variant]} ${className}`} {...rest} />;
}
