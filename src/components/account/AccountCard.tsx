import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/shell/Logo";
import { APP_NAME } from "@/lib/app-name";
import { LANDING_PAGE } from "@/lib/route-guard";

/**
 * The frame of every account page: the mark and name, then a white card. The mark leads to the
 * landing page (spec 63), so a visitor who landed on a form can still find out what the app is.
 */
export function AccountCard({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-12">
      <div className="w-full max-w-[380px]">
        <div className="mb-6 flex justify-center">
          <Link
            href={LANDING_PAGE}
            aria-label={`${APP_NAME} home page`}
            className="rounded-[10px] outline-offset-4 focus-visible:outline-2 focus-visible:outline-ink"
          >
            <Logo />
          </Link>
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
