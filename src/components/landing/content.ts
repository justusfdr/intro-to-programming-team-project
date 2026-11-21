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
  { href: `${LANDING_PATH}#research`, label: "The research" },
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

/** A stop of the day the page scrolls through under "How it works" (spec 62). */
export type Stop = {
  id: "goal" | "plan" | "focus" | "travel" | "reach" | "report";
  /** The stretch of the day the red line crosses while this stop is on screen, in minutes of the day. */
  from: number;
  to: number;
  /** The time above the title. */
  time: string;
  tag: string;
  title: string;
  text: string;
  points: readonly string[];
  /** The way on under the words; the three steps have one. */
  link?: string;
};

/** The day of the story: its name, and the hours the calendar beside it shows, in minutes of the day. */
export const STORY_DAY = { name: "Thu, Nov 19", from: 8 * 60, to: 18 * 60 } as const;

/** The words of one of the three steps, for the stop that shows it. */
function words(id: Step["id"]): Pick<Stop, "tag" | "title" | "text" | "points"> {
  const step = STEPS.find((item) => item.id === id) ?? STEPS[0];
  return { tag: step.tag, title: step.title, text: step.text, points: step.points };
}

/**
 * One day in six stops, from a new goal in the morning to the numbers in the evening. Plan, Focus
 * and Reach are the three steps above; the other three describe what the app does today as well
 * (the goal setup, travel times and the "Time to leave" widget, Analytics and its PDF export).
 */
export const STORY: readonly Stop[] = [
  {
    id: "goal",
    from: 8 * 60,
    to: 8 * 60 + 25,
    time: "8:00 AM",
    tag: "Goal",
    title: "Start with what you want",
    text: "Name what you are working toward and answer six short questions: how often, how long, where, which time of day, which days never, and by when. That is all LockedIn needs to plan around it.",
    points: ["A deadline, or a goal that stays open", "A weekly rhythm, like four sessions a week", "Days the coach never plans on"],
  },
  { id: "plan", from: 8 * 60 + 25, to: 9 * 60, time: "8:30 AM", ...words("plan"), link: "Plan your first week" },
  { id: "focus", from: 9 * 60, to: 11 * 60, time: "9:00 AM", ...words("focus"), link: "Start a focus session" },
  {
    id: "travel",
    from: 11 * 60,
    to: 11 * 60 + 15,
    time: "11:00 AM",
    tag: "On the way",
    title: "Know when to leave",
    text: "Give an event a place and LockedIn works out the way there, by car, by bike, on foot or by public transport. The travel time shows in your calendar before the event, and the coach plans around it.",
    points: ["Travel time for every event with a place", "A widget that counts down to when you set off", "One click opens the route in Google Maps"],
  },
  { id: "reach", from: 11 * 60 + 15, to: 14 * 60 + 30, time: "2:00 PM", ...words("reach"), link: "Set your first goal" },
  {
    id: "report",
    from: 14 * 60 + 30,
    to: 18 * 60,
    time: "5:00 PM",
    tag: "Look back",
    title: "Your weeks in numbers",
    text: "Analytics shows where your time went: focus time, goals reached, streaks and the distractions you kept out. Export the weeks you pick as a PDF, to keep, to print or to send.",
    points: ["Six tabs, from an overview to distractions", "Choose the weeks and the parts of the report", "A PDF with numbers, charts and a short summary"],
  },
];

export type Tool = {
  id: "outlook" | "claude" | "chrome" | "maps";
  name: string;
  text: string;
  status: string;
  /** Not built yet; shown as "Coming soon". */
  soon?: boolean;
};

export const TOOLS: readonly Tool[] = [
  { id: "outlook", name: "Outlook Calendar", text: "Your Outlook events show up here, and what you plan here appears in Outlook.", status: "Two-way sync" },
  { id: "claude", name: "Claude", text: "The coach that drafts your week is powered by Claude. It only suggests: nothing changes until you accept.", status: "AI coach" },
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
      "No. LockedIn works on its own. If you connect Outlook, your Outlook events show up in LockedIn and the events you create here appear in Outlook.",
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
