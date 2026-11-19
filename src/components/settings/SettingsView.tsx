"use client";

// The settings page's content (spec 12, layout from spec 52): the title, then a list of sections on the
// left (your profile on top, on phones the People page under it (spec 53), then Planning, Focus and
// Account) and the open section's cards on the right.
// On phones the list fills the screen and a section opens on its own, with a way back. Which section is
// open lives in the address (#calendar, #travel, #blocker, #account; the old #outlook opens Calendar), so
// links from other pages keep working and the browser's back button returns to the list on a phone.
// Every section's cards stay on the page; the closed ones are hidden, so what was typed is kept.
// The page (src/app/settings/page.tsx) loads the data on the server.
import Link from "next/link";
import { useSyncExternalStore, type MouseEvent, type ReactNode } from "react";
import { CalendarDays, Car, ChevronLeft, ChevronRight, CreditCard, ShieldCheck, Users, type LucideIcon } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { PageHeader } from "@/components/ui/Card";
import type { BlockerData } from "@/lib/blocker/types";
import type { OwnProfile } from "@/lib/profiles/types";
import type { SettingsPageData } from "@/lib/settings/types";
import { BlockerCard } from "./BlockerCard";
import { OutlookCard, outlookPill } from "./OutlookCard";
import { PreferencesCard } from "./PreferencesCard";
import { TravelCard } from "./TravelCard";
import { YourAccountCard } from "./YourAccountCard";
import type { PillState } from "./fields";

export type SectionKey = "calendar" | "travel" | "blocker" | "account";

/** The section a link's #part opens. Other parts open nothing (Calendar is shown on wide screens). */
const BY_HASH: Record<string, SectionKey> = {
  calendar: "calendar",
  outlook: "calendar",
  preferences: "calendar",
  travel: "travel",
  blocker: "blocker",
  focus: "blocker",
  account: "account",
};

export function sectionOf(hash: string): SectionKey | null {
  return BY_HASH[hash.replace(/^#/, "")] ?? null;
}

// The address's #part, read without an effect: the server and the first render see none.
const CHANGED = "lockedin:settings-section";
function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  window.addEventListener("popstate", onChange);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener("hashchange", onChange);
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(CHANGED, onChange);
  };
}
const readHash = () => window.location.hash;
const noHash = () => "";

/** Opens a section (or the list, with null) as a new history entry, without the jump to an anchor. */
function go(section: SectionKey | null) {
  const { pathname, search } = window.location;
  window.history.pushState(window.history.state, "", section ? `#${section}` : `${pathname}${search}`);
  window.dispatchEvent(new Event(CHANGED));
  window.scrollTo({ top: 0 });
}

type Section = {
  key: SectionKey;
  label: string;
  icon: LucideIcon;
  /** On phones, the current value under the name ("Connected", "Free plan"). */
  value: string;
  /** A coloured dot next to the name when something is on or needs the user. */
  dot?: PillState;
  panel: ReactNode;
};

const DOT: Record<PillState, string> = {
  connected: "bg-success",
  ready: "bg-warning",
  attention: "bg-danger",
  off: "bg-ink-3",
};
const DOT_WORDS: Record<PillState, string> = { connected: "on", ready: "ready", attention: "needs you", off: "off" };

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20";

export function SettingsView({
  data,
  blocker,
  profile,
}: {
  data: SettingsPageData;
  blocker: BlockerData;
  /** The user's own profile: the row "Your profile" at the top of the list (spec 40). Left out where it is not loaded. */
  profile?: OwnProfile;
}) {
  const chosen = sectionOf(useSyncExternalStore(subscribe, readHash, noHash));
  // Wide screens always show a section; phones show the list until one is chosen.
  const open: SectionKey = chosen ?? "calendar";

  const outlook = outlookPill(data.outlook, data.outlookAvailable);
  const groups: { title: string; sections: Section[] }[] = [
    {
      title: "Planning",
      sections: [
        {
          key: "calendar",
          label: "Calendar",
          icon: CalendarDays,
          value: data.outlook.status === "none" ? "Outlook not connected" : `Outlook: ${outlook.text.toLowerCase()}`,
          dot: data.outlook.status === "none" ? undefined : outlook.state,
          panel: (
            <>
              <OutlookCard outlook={data.outlook} outlookAvailable={data.outlookAvailable} today={data.today} timeZone={data.settings.timeZone} />
              <PreferencesCard settings={data.settings} defaultView={data.defaultView} />
            </>
          ),
        },
        {
          key: "travel",
          label: "Travel",
          icon: Car,
          value: data.settings.homeAddress || "No home address yet",
          panel: <TravelCard settings={data.settings} places={data.places} />,
        },
      ],
    },
    {
      title: "Focus",
      sections: [
        {
          key: "blocker",
          label: "Focus blocker",
          icon: ShieldCheck,
          value: blocker.connected ? "Connected" : "Not connected",
          dot: blocker.connected ? "connected" : "attention",
          panel: <BlockerCard data={blocker} />,
        },
      ],
    },
    {
      title: "Account",
      sections: [
        {
          key: "account",
          label: "Account and plan",
          icon: CreditCard,
          value: data.plan === "pro" ? "Pro plan" : "Free plan",
          panel: <YourAccountCard hasDemo={data.hasDemo} plan={data.plan} />,
        },
      ],
    },
  ];
  const all = groups.flatMap((g) => g.sections);

  function choose(event: MouseEvent<HTMLAnchorElement>, key: SectionKey) {
    // A new tab or window still gets the plain link.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (key !== chosen) go(key);
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-6 md:px-8 md:py-8">
      <div className={chosen ? "max-md:hidden" : undefined}>
        <PageHeader title="Settings" subtitle="Calendar, travel, the focus blocker and your account." />
      </div>

      <div className="md:grid md:grid-cols-[220px_minmax(0,1fr)] md:items-start md:gap-8 lg:gap-12">
        <nav aria-label="Settings sections" className={`flex flex-col gap-5 md:sticky md:top-6 ${chosen ? "max-md:hidden" : ""}`}>
          {profile && (
            <Link
              href="/profile"
              className={`flex items-center gap-3 rounded-2xl border border-line-subtle bg-surface px-4 py-3 transition-colors hover:bg-raised/60 md:rounded-lg md:border-0 md:bg-transparent md:px-[9px] md:py-2 ${FOCUS}`}
            >
              <Avatar name={profile.name} photoUrl={profile.photoUrl} size={32} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-ink">Your profile</span>
                <span className="block truncate text-xs text-ink-2">{profile.name}</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-ink-3" strokeWidth={1.8} aria-hidden="true" />
            </Link>
          )}
          {/* Phones have no sidebar: the People page (spec 53) is reached from here. */}
          <Link
            href="/people"
            className={`flex items-center gap-3 rounded-2xl border border-line-subtle bg-surface px-4 py-3 text-sm text-ink transition-colors hover:bg-raised/60 md:hidden ${FOCUS}`}
          >
            <Users className="size-[18px] shrink-0 text-ink-3" strokeWidth={1.8} aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block font-medium">People</span>
              <span className="block truncate text-xs text-ink-2">Contacts, invitations and sharing</span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-ink-3" strokeWidth={1.8} aria-hidden="true" />
          </Link>

          {groups.map((group) => (
            <div key={group.title}>
              <p className="mb-1.5 px-1 text-xs font-medium text-ink-3 md:px-[9px]">{group.title}</p>
              <ul className="flex flex-col divide-y divide-line-subtle overflow-hidden rounded-2xl border border-line-subtle bg-surface md:gap-0.5 md:overflow-visible md:rounded-none md:border-0 md:divide-y-0 md:bg-transparent">
                {group.sections.map((s) => {
                  const on = s.key === open;
                  return (
                    <li key={s.key}>
                      <a
                        href={`#${s.key}`}
                        onClick={(e) => choose(e, s.key)}
                        aria-current={on ? "true" : undefined}
                        className={`flex items-center gap-3 px-4 py-3 text-sm transition-colors md:h-9 md:gap-2.5 md:rounded-lg md:px-[9px] md:py-0 ${FOCUS} ${
                          on ? "md:bg-raised md:font-medium md:text-ink" : "md:text-ink-2 md:hover:bg-raised/60 md:hover:text-ink"
                        } text-ink max-md:hover:bg-raised/60`}
                      >
                        {/* Phones mark nothing: the list leads into one section. */}
                        <s.icon className={`size-[18px] shrink-0 text-ink-3 ${on ? "md:text-ink md:[stroke-width:2.2]" : ""}`} strokeWidth={1.8} aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{s.label}</span>
                          <span className="block truncate text-xs text-ink-2 md:hidden">{s.value}</span>
                        </span>
                        {s.dot && (
                          <span className={`size-2 shrink-0 rounded-full ${DOT[s.dot]}`}>
                            <span className="sr-only">({DOT_WORDS[s.dot]})</span>
                          </span>
                        )}
                        <ChevronRight className="size-4 shrink-0 text-ink-3 md:hidden" strokeWidth={1.8} aria-hidden="true" />
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className={chosen ? undefined : "max-md:hidden"}>
          <button
            type="button"
            onClick={() => go(null)}
            className={`-ml-2 mb-4 inline-flex h-9 items-center gap-1 rounded-full px-2 text-sm font-medium text-ink-2 hover:bg-raised hover:text-ink md:hidden ${FOCUS}`}
          >
            <ChevronLeft className="size-4" strokeWidth={2} aria-hidden="true" />
            Settings
          </button>
          {all.map((s) => (
            <section key={s.key} aria-label={s.label} hidden={s.key !== open} className="flex max-w-3xl flex-col gap-4">
              {s.panel}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
