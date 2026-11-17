// The bar at the top of the landing page (spec 45): the name, the three sections, "Log in" and the
// way to a new account. It stays at the top while scrolling, like the header of the coach page.
import Link from "next/link";
import { Logo } from "@/components/shell/Logo";
import { LinkButton } from "@/components/ui/Button";
import { APP_NAME } from "@/lib/app-name";
import { LANDING_PATH, SECTION_LINKS } from "./content";

export function LandingNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-line-subtle bg-canvas/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-[1160px] items-center justify-between gap-3 px-5 md:grid md:grid-cols-[1fr_auto_1fr] md:px-8">
        <Link
          href={LANDING_PATH}
          aria-label={`${APP_NAME}, start page`}
          className="justify-self-start rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 focus-visible:ring-offset-4 focus-visible:ring-offset-canvas"
        >
          <Logo />
        </Link>

        <nav aria-label="Sections" className="hidden items-center gap-1 md:flex">
          {SECTION_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-full px-3.5 py-2 text-sm font-medium text-ink-2 transition-colors hover:bg-raised hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-1.5 justify-self-end">
          <LinkButton href="/sign-in" variant="ghost">
            Log in
          </LinkButton>
          <LinkButton href="/sign-up">Start for free</LinkButton>
        </div>
      </div>
    </header>
  );
}
