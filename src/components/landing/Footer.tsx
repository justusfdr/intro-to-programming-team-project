// The foot of the landing page and of the legal notes (spec 45): the name, and three short lists of
// links. Every link leads somewhere that exists.
import Link from "next/link";
import { Logo } from "@/components/shell/Logo";
import { APP_NAME } from "@/lib/app-name";
import { LANDING_PATH, LEGAL_PATH } from "./content";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: `${LANDING_PATH}#how`, label: "How it works" },
      { href: `${LANDING_PATH}#research`, label: "The research" },
      { href: `${LANDING_PATH}#pricing`, label: "Pricing" },
      { href: `${LANDING_PATH}#faq`, label: "FAQ" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: `${LANDING_PATH}#why`, label: "Why we built it" },
      { href: "/sign-in", label: "Log in" },
      { href: "/sign-up", label: "Create an account" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: `${LEGAL_PATH}#privacy`, label: "Privacy" },
      { href: `${LEGAL_PATH}#terms`, label: "Terms" },
      { href: `${LEGAL_PATH}#cookies`, label: "Cookies" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-line-subtle bg-raised">
      <div className="mx-auto w-full max-w-[1160px] px-5 py-14 md:px-8">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
          <div className="col-span-2 md:col-span-1">
            <Logo />
            <p className="mt-3 max-w-[18rem] text-sm leading-6 text-ink-2">The calendar that plans around your goals and keeps distractions out.</p>
          </div>
          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h2 className="text-[13px] font-semibold text-ink">{column.title}</h2>
              <ul className="mt-3 flex flex-col gap-2.5">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="rounded-sm text-sm text-ink-2 underline-offset-4 transition-colors hover:text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <p className="mt-12 border-t border-line pt-6 text-[13px] text-ink-3">{`© 2026 ${APP_NAME}`}</p>
      </div>
    </footer>
  );
}
