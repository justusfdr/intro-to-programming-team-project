import type { ReactNode } from "react";
import { Logo } from "@/components/shell/Logo";

/** The frame of every account page, in the prototype's style: the mark and name, then a white card. */
export function AccountCard({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-12">
      <div className="w-full max-w-[380px]">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        <section
          className="rounded-panel border border-line-subtle bg-surface p-6 shadow-float sm:p-7"
          aria-labelledby="page-title"
        >
          <h1 id="page-title" className="text-[26px] leading-[32px] font-semibold tracking-heading text-ink">
            {title}
          </h1>
          <div className="mt-6">{children}</div>
        </section>
        {footer && <div className="mt-5 text-center text-sm text-ink-2">{footer}</div>}
      </div>
    </main>
  );
}
