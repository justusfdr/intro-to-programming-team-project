import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/landing/Footer";
import { LANDING_PATH } from "@/components/landing/content";
import { LandingNav } from "@/components/landing/LandingNav";
import { APP_NAME } from "@/lib/app-name";

export const metadata: Metadata = {
  title: "Privacy, terms and cookies",
  description: `What ${APP_NAME} stores, who else receives data, the terms of use and the cookies it sets.`,
};

type Note = { id: string; title: string; paragraphs: string[] };

// Short notes in plain words (spec 45), open to everyone like the landing page. Each sentence
// describes what the code does today: change the code, change the sentence. A draft for the team to
// read before the site is public; it is not a lawyer's text.
const NOTES: Note[] = [
  {
    id: "privacy",
    title: "Privacy",
    paragraphs: [
      `${APP_NAME} stores what you put into it: your e-mail address, your events, goals, tasks and to-dos, your focus sessions, your settings and, if you add them, a profile photo and saved places. Your account and this data are kept with Supabase. Each account can read only its own data.`,
      "Other services receive data only when you use the feature that needs them. Microsoft, if you connect Outlook: your events are synced in both directions. Anthropic, when you write to the coach: your recent messages, your goals, your events of the next 14 days and weekly totals of your focus time. Google Maps, when you search for a place or ask for a travel time: the addresses. Stripe, when you upgrade to Pro: the payment itself, on Stripe's own page. We never see your card details.",
      "There are no ads and no tracking, and we do not sell data. You can delete your account in the settings at any time; that removes your data.",
    ],
  },
  {
    id: "terms",
    title: "Terms",
    paragraphs: [
      `${APP_NAME} is offered as it is. We work to keep it running and your data safe, but we cannot promise that it is free of errors or always available.`,
      "The site blocker is a help, not a lock: it works in Chrome on a computer, and you can end a session or change your block list whenever you like. The coach makes suggestions; you decide what goes into your calendar.",
      "The free plan stays free. Pro is billed monthly through Stripe. You can cancel at any time and keep Pro until the end of the month you paid for.",
    ],
  },
  {
    id: "cookies",
    title: "Cookies",
    paragraphs: [
      `${APP_NAME} sets only the cookies it needs to work: the ones that keep you signed in, which scripts on the page cannot read, and one more while you connect Outlook.`,
      "There are no cookies for advertising or analytics, so there is nothing to accept or decline.",
    ],
  },
];

export default function LegalPage() {
  return (
    <div className="landing flex min-h-dvh flex-col bg-canvas text-ink">
      <LandingNav />
      <main className="mx-auto w-full max-w-[720px] flex-1 px-5 py-14 md:px-8 md:py-20">
        <h1 className="text-[36px] leading-[1.1] font-semibold tracking-heading text-ink md:text-[44px]">Privacy, terms and cookies</h1>
        <p className="mt-4 text-[17px] leading-7 text-ink-2">The short version, in plain words.</p>

        <div className="mt-12 flex flex-col gap-12">
          {NOTES.map((note) => (
            <section key={note.id} id={note.id} aria-labelledby={`${note.id}-title`} className="border-t border-line-subtle pt-8">
              <h2 id={`${note.id}-title`} className="text-[24px] leading-[30px] font-semibold tracking-heading text-ink">
                {note.title}
              </h2>
              {note.paragraphs.map((paragraph) => (
                <p key={paragraph} className="mt-4 text-[15px] leading-7 text-ink-2">
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </div>

        <p className="mt-12">
          <Link
            href={LANDING_PATH}
            className="rounded-sm text-[15px] font-semibold text-ink underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
          >
            Back to the start page
          </Link>
        </p>
      </main>
      <Footer />
    </div>
  );
}
