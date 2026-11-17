// Spec 43: the coach page opened from a goal starts with the sentence in the field (nothing sent), and
// "What is sent?" says what is sent about a goal's routine and that its place is not.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DisplayProvider } from "@/components/shell/DisplayProvider";
import { planGoalText } from "@/lib/chat/plan-goal";
import type { ChatPageData } from "@/lib/chat/types";
import { CoachView } from "./CoachView";
import { WhatIsSent } from "./Composer";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const GYM = { id: "0b9c8d7e-6f5a-4b3c-9d2e-1f0a9b8c7d6e", title: "Gym", look: { color: "teal" as const, icon: "dumbbell" as const } };

const DATA: ChatPageData = {
  display: { timeFormat: "12h", dayStartHour: 7, dayEndHour: 21 },
  timeZone: "Europe/Lisbon",
  messages: [],
  draftDayEvents: [],
  draftDays: [],
  goals: [GYM],
  messagesLeft: 17,
  chatAllowed: true,
  assistantConfigured: true,
};

/** As the page renders it for /coach?plan=<value>. */
function page(plan: string | string[] | undefined) {
  const planText = planGoalText(plan, DATA.goals);
  return renderToStaticMarkup(
    <DisplayProvider value={DATA.display}>
      <CoachView data={DATA} {...(planText ? { defaultText: planText, focusField: true } : {})} />
    </DisplayProvider>,
  );
}

describe("the coach page with ?plan=", () => {
  it("one of the user's goals: the field starts with the sentence, ready to send", () => {
    const html = page(GYM.id);
    expect(html).toContain(">Plan &quot;Gym&quot; into my week.</textarea>");
    expect(html).toMatch(/aria-label="Send"(?! disabled)/);
  });

  it("an unknown, malformed or repeated value: the same page as without it", () => {
    const plain = page(undefined);
    for (const value of ["7f1d5c3e-1a2b-4c3d-8e9f-0a1b2c3d4e5f", "gym", "", `${GYM.id}x`, [GYM.id, GYM.id], "<script>"]) {
      expect(page(value), String(value)).toBe(plain);
    }
  });
});

describe("What is sent?", () => {
  it("names what is sent about a goal's routine, and that its place is not", () => {
    const html = renderToStaticMarkup(<WhatIsSent />);
    expect(html).toContain(
      "For a goal with a routine: its category, how long one session is, the time of day, the days it is never done on, whether it happens away from home, and how many sessions are left this week and next",
    );
    const notSent = html.slice(html.indexOf("Not sent"));
    expect(notSent).toContain("the places of your goals");
  });
});
