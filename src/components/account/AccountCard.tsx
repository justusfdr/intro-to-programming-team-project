import type { ReactNode } from "react";
import { APP_NAME } from "@/lib/app-name";

/** The frame of every account page: app name, page title, the form, and links below it. */
export function AccountCard({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <p className="mb-6 text-center text-sm font-semibold text-ink-2">{APP_NAME}</p>
        <section className="rounded-card border border-line-subtle bg-surface p-6 shadow-sm" aria-labelledby="page-title">
          <h1 id="page-title" className="text-2xl font-semibold tracking-heading">
            {title}
          </h1>
          <div className="mt-6">{children}</div>
        </section>
        {footer && <div className="mt-4 text-center text-sm text-ink-2">{footer}</div>}
      </div>
    </main>
  );
}
