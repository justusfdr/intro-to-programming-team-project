import "server-only";

// What each page reads, in as few transactions as possible (the database may be far away: every
// transaction costs BEGIN and COMMIT, every round of questions one more trip).
// - Each page reads everything in ONE withUser transaction, and starts its independent reads
//   together, so the driver sends them in one round (db/with-user.ts). Reads without parameters are
//   started before reads with parameters: the driver first asks for a parameter's type, and holds
//   back everything started after such a read until it is done.
// - Before that, at most ONE "by itself" step in a transaction of its own that is saved at once
//   (finishing due sessions, R13, or removing old done tasks, R33), so it stays saved even if the
//   page's reading then fails.
// The counting test (load.test.ts) fails when a page opens more transactions than that.
import type { AnalyticsData } from "@/lib/analytics/types";
import type { BlockerData } from "@/lib/blocker/types";
import type { WeekData } from "@/lib/events/types";
import type { FocusData } from "@/lib/focus/types";
import type { GoalView } from "@/lib/goals/types";
import type { SettingsPageData } from "@/lib/settings/types";
import type { TaskDto } from "@/lib/tasks/types";
import type { Display } from "@/lib/time/display";
import { readAnalytics } from "@/lib/server/analytics/load";
import { readBlocker } from "@/lib/server/blocker/page";
import type { Deps } from "@/lib/server/deps";
import { welcomeDue } from "@/lib/server/demo/rows";
import { readWeek } from "@/lib/server/events/week";
import { settleSessions } from "@/lib/server/focus/sessions";
import { readFocus } from "@/lib/server/focus/load";
import { readGoalViews } from "@/lib/server/goals/load";
import { readOutlookState } from "@/lib/server/outlook/sync";
import { readSettings } from "@/lib/server/settings";
import { readSettingsPage } from "@/lib/server/settings-page";
import { readTasks } from "@/lib/server/tasks/rows";
import { settleTasks } from "@/lib/server/tasks/settle";
import { sortTasks } from "@/lib/tasks/order";

type PageDeps = Pick<Deps, "withUser" | "now">;

function displayOf(settings: { timeFormat: Display["timeFormat"]; dayStartHour: number; dayEndHour: number }): Display {
  return { timeFormat: settings.timeFormat, dayStartHour: settings.dayStartHour, dayEndHour: settings.dayEndHour };
}

export type CalendarPageData = { display: Display; week: WeekData; goals: GoalView[]; tasks: TaskDto[]; showWelcome: boolean };

/** The calendar (spec 02): the week, the goals with progress, the tasks, and whether the welcome is due. */
export async function loadCalendarPage(deps: PageDeps, userId: string, requestedWeek?: string): Promise<CalendarPageData> {
  // By itself: done tasks older than 7 days go first, saved on their own (R33).
  await settleTasks(deps, userId);
  const now = deps.now();
  return deps.withUser(userId, async (query) => {
    // Every read without parameters is started here, before anything is awaited: one round.
    // The week's events need the time zone, so they follow as soon as the settings row is in.
    const settingsRead = readSettings(query);
    const timeZone = settingsRead.then((settings) => settings.timeZone);
    const [settings, week, goals, tasks, showWelcome] = await Promise.all([
      settingsRead,
      readWeek(query, now, requestedWeek, timeZone, readOutlookState(query)),
      readGoalViews(query, now, timeZone),
      readTasks(query),
      // A new account (no goals, events or tasks, welcome never answered) sees the welcome (spec 13).
      welcomeDue(query),
    ]);
    return { display: displayOf(settings), week, goals, tasks: sortTasks(tasks), showWelcome };
  });
}

export type FocusPageData = { display: Display; focus: FocusData; blocker: BlockerData };

/** The Focus page (spec 04): the sessions, the event it was opened for, and the blocker. */
export async function loadFocusPage(deps: PageDeps, userId: string, eventId?: string): Promise<FocusPageData> {
  const now = deps.now();
  // By itself: sessions whose planned end has passed finish first, saved on their own (R13).
  await settleSessions(deps, userId, now);
  return deps.withUser(userId, async (query) => {
    // Reads without parameters first (they travel together), those with parameters after them
    // (the driver holds back what is started after a read with parameters; see db/with-user.ts).
    let blockerStarted!: () => void;
    const afterBlocker = new Promise<void>((resolve) => (blockerStarted = resolve));
    const settingsRead = readSettings(query);
    const all = Promise.all([
      settingsRead,
      readFocus(query, now, eventId, afterBlocker),
      readBlocker(query, now, settingsRead.then((s) => s.timeZone)),
    ]);
    blockerStarted();
    const [settings, focus, blocker] = await all;
    return { display: displayOf(settings), focus, blocker };
  });
}

export type AnalyticsPageData = { display: Display; analytics: AnalyticsData };

/** The Analytics page (spec 06). Reads only, apart from finishing due sessions first (R13). */
export async function loadAnalyticsPage(deps: PageDeps, userId: string, requestedWeek?: string): Promise<AnalyticsPageData> {
  const now = deps.now();
  // By itself: a session that reached its planned length finishes first, so it counts (R13).
  await settleSessions(deps, userId, now);
  return deps.withUser(userId, async (query) => {
    const settingsRead = readSettings(query);
    const [settings, analytics] = await Promise.all([
      settingsRead,
      readAnalytics(query, now, requestedWeek, settingsRead.then((s) => s.timeZone)),
    ]);
    return { display: displayOf(settings), analytics };
  });
}

export type SettingsPageLoad = { display: Display; page: SettingsPageData; blocker: BlockerData };

/** The settings page (spec 12): the settings, plan, Outlook, demo state, and the blocker card. */
export async function loadSettingsPageAll(deps: PageDeps, userId: string): Promise<SettingsPageLoad> {
  const now = deps.now();
  // By itself: due sessions finish first, so the blocker card shows the right state (R13, R15).
  await settleSessions(deps, userId, now);
  return deps.withUser(userId, async (query) => {
    const settingsRead = readSettings(query);
    const [page, blocker] = await Promise.all([
      readSettingsPage(query, now, settingsRead),
      readBlocker(query, now, settingsRead.then((s) => s.timeZone)),
    ]);
    return { display: displayOf(page.settings), page, blocker };
  });
}
