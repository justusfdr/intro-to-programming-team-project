import type { HTMLAttributes, ReactNode } from "react";

// The prototype's card and page header (components/ui/primitives.tsx there).

/** White card with a fine border. */
export function Card({ className = "", ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`rounded-card border border-line-subtle bg-surface ${className}`} {...rest} />;
}

/** Page title, subtitle and actions on the right. */
export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[28px] leading-[34px] font-semibold tracking-heading text-ink md:text-[32px] md:leading-[38px]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}
