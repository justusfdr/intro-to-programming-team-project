// The words of the landing page that are lists (spec 45): the navigation, the three steps, the
// connected tools and the questions. Every claim here describes something the app does today;
// what is not built yet is marked `soon`.
import { PLANS } from "@/lib/billing/plans";

/** The address of the landing page. Signed-out visitors can reach it (src/lib/route-guard.ts). */
export const LANDING_PATH = "/home";
export const LEGAL_PATH = "/legal";

/** The sections the navigation jumps to. Full addresses, so they also work from the legal notes. */
export const SECTION_LINKS = [
  { href: `${LANDING_PATH}#how`, label: "How it works" },
  { href: `${LANDING_PATH}#pricing`, label: "Pricing" },
  { href: `${LANDING_PATH}#faq`, label: "FAQ" },
] as const;

export type Step = {
  id: "plan" | "focus" | "reach";
  number: string;
  tag: string;
  title: string;
  text: string;
  points: readonly string[];
};

export const STEPS: readonly Step[] = [
  {
    id: "plan",
    number: "01",
    tag: "Plan",
    title: "Plan the week in a minute",
    text: "Tell the coach what is on your plate, typed or spoken. It knows your goals and your calendar, and drafts a plan with real times. Keep what fits, drag what does not, and add it with one click.",
    points: ["Plans up to 14 days ahead", "Works around the events you already have", "Every accepted plan can be undone"],
  },
  {
    id: "focus",
    number: "02",
    tag: "Focus",
    title: "Focus that holds",
    text: "Start a session and the distractions leave the table. The Chrome extension blocks the sites you choose for as long as the session runs. A goal can also switch blocking on by itself whenever its time comes up in your calendar.",
    points: ["Sessions from a few minutes to four hours", "Your own block list, up to 50 sites", "A focus score after every session"],
  },
  {
    id: "reach",
    number: "03",
    tag: "Reach",
    title: "Goals you can watch move",
    text: "Give a goal a deadline and a weekly rhythm, like four study sessions a week. LockedIn counts what you really did, shows every week at a glance and tells you how many days are left.",
    points: ["Weekly rules for every goal", "A strip of weeks: met, missed or still open", "Analytics for focus time and blocked distractions"],
  },
];

export type Tool = {
  id: "outlook" | "google-calendar" | "chrome" | "maps";
  name: string;
  text: string;
  status: string;
  /** Not built yet; shown as "Coming soon". */
  soon?: boolean;
};

export const TOOLS: readonly Tool[] = [
  { id: "outlook", name: "Outlook Calendar", text: "Your Outlook events show up here, and what you plan here appears in Outlook.", status: "Two-way sync" },
  { id: "google-calendar", name: "Google Calendar", text: "The same two-way sync for Google Calendar is next on our list.", status: "Coming soon", soon: true },
  { id: "chrome", name: "Chrome", text: "Our extension blocks the sites that distract you while you focus.", status: "Site blocker" },
  { id: "maps", name: "Google Maps", text: "Travel times for events with a place, so you know when to leave.", status: "Travel times" },
];

const pro = PLANS.find((plan) => plan.id === "pro");
/** "€4.99", from the same list the pricing page in the app uses. */
export const PRO_PRICE = pro ? pro.price : "";

export type Question = { question: string; answer: string };

export const QUESTIONS: readonly Question[] = [
  {
    question: "What is LockedIn?",
    answer:
      "A calendar for people who want to get real work done. It brings your events, your goals and your focus sessions together, plans the week around what matters to you and keeps distractions out while you work.",
  },
  {
    question: "How is it different from the calendar I already have?",
    answer:
      "A normal calendar stores appointments. LockedIn also knows your goals: it counts what you did for each of them every week, suggests when to work on them, and protects that time with a site blocker.",
  },
  {
    question: "Do I have to connect my Outlook calendar?",
    answer:
      "No. LockedIn works on its own. If you connect Outlook, your Outlook events show up in LockedIn and the events you create here appear in Outlook. Google Calendar is next on our list.",
  },
  {
    question: "How does the site blocker work?",
    answer:
      "Install our Chrome extension and choose the sites that distract you. While a focus session runs, or during the events of a goal with auto-block on, those sites show a block page instead. It works in Chrome on your computer, and it is a help, not a lock: you can end a session whenever you want.",
  },
  {
    question: "What does the coach know about me?",
    answer:
      "The coach is powered by Claude. To plan with you it receives your goals, your events for the next 14 days and weekly totals of your focus time. It only suggests: nothing in your calendar changes until you accept a draft.",
  },
  {
    question: "What does it cost?",
    answer: `The calendar, goals, focus sessions, the site blocker and analytics are free. Pro adds the coach for ${PRO_PRICE} a month, and you can cancel any time.`,
  },
  {
    question: "Does it work on my phone?",
    answer: "Yes. LockedIn runs in the browser, on a phone as well as on a laptop. Only the site blocker needs Chrome on a computer.",
  },
];
