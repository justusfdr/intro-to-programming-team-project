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
import { chatAllowed, DAILY_MESSAGES } from "@/lib/chat/access";
import type { ChatPageData } from "@/lib/chat/types";
import { lookOf } from "@/lib/goals/style";
import type { BlockerData } from "@/lib/blocker/types";
import type { OwnProfile, PeopleData } from "@/lib/profiles/types";
import type { ListPageData, ListSummary } from "@/lib/lists/types";
import type { WeekData } from "@/lib/events/types";
import type { View } from "@/lib/events/views";
import type { FocusData } from "@/lib/focus/types";
import type { GoalView } from "@/lib/goals/types";
import type { SettingsPageData } from "@/lib/settings/types";
import type { TaskDto } from "@/lib/tasks/types";
import type { Display } from "@/lib/time/display";
import { readAnalytics } from "@/lib/server/analytics/load";
import { readChatAccount, readMessages } from "@/lib/server/chat/rows";
import { chatProOnly } from "@/lib/server/config";
import { EVENT_COLUMNS, toEventDto, type EventRow } from "@/lib/server/events/rows";
import { readGoals } from "@/lib/server/goals/rows";
import { readBlocker } from "@/lib/server/blocker/page";
import type { Deps } from "@/lib/server/deps";
import { welcomeDue } from "@/lib/server/demo/rows";
import { readCalendar } from "@/lib/server/events/week";
import { settleSessions } from "@/lib/server/focus/sessions";
import { readFocus } from "@/lib/server/focus/load";
import { readGoalViews } from "@/lib/server/goals/load";
import { readOutlookState } from "@/lib/server/outlook/sync";
import { readOwnProfile, readPeople } from "@/lib/server/profiles/cards";
import { readSharesOverview, readSharingPeople } from "@/lib/server/shares/read";
import type { ContactShares, SharingPerson } from "@/lib/shares/types";
import type { Query } from "@/lib/server/db";
import { readListDetail, readListSummaries, readShareContacts } from "@/lib/server/lists/read";
import { readDefaultView, readSettings } from "@/lib/server/settings";
import { readSettingsPage } from "@/lib/server/settings-page";
import { readTasks } from "@/lib/server/tasks/rows";
import { settleTasks } from "@/lib/server/tasks/settle";
import { sortTasks } from "@/lib/tasks/order";
import { addDays, localDateOf, startOfLocalDate } from "@/lib/time/zoned";

type PageDeps = Pick<Deps, "withUser" | "now">;

/** How many of the latest messages the chat page shows. */
const CHAT_PAGE_MESSAGES = 100;

function displayOf(settings: { timeFormat: Display["timeFormat"]; dayStartHour: number; dayEndHour: number }): Display {
  return { timeFormat: settings.timeFormat, dayStartHour: settings.dayStartHour, dayEndHour: settings.dayEndHour };
}

export type CalendarPageData = { display: Display; week: WeekData; goals: GoalView[]; tasks: TaskDto[]; showWelcome: boolean };

/**
 * The calendar (specs 02 and 14): the days of the view (the address's, else the default view from the
 * settings) around the address's day, the goals with progress, the tasks, and whether the welcome is due.
 */
export async function loadCalendarPage(deps: PageDeps, userId: string, requestedDate?: string, requestedView?: View): Promise<CalendarPageData> {
  // By itself: done tasks older than 7 days go first, saved on their own (R33).
  await settleTasks(deps, userId);
  const now = deps.now();
  return deps.withUser(userId, (query) => readCalendarPage(query, now, requestedDate, requestedView));
}

/** Every read of the calendar page inside a transaction that is already open. */
async function readCalendarPage(query: Query, now: Date, requestedDate?: string, requestedView?: View): Promise<CalendarPageData> {
  // Every read without parameters is started here, before anything is awaited: one round.
  // The events need the time zone and the view, so they follow as soon as those rows are in.
  const settingsRead = readSettings(query);
  const timeZone = settingsRead.then((settings) => settings.timeZone);
  const view = requestedView ?? readDefaultView(query);
  const [settings, week, goals, tasks, showWelcome] = await Promise.all([
    settingsRead,
    readCalendar(query, now, view, requestedDate, timeZone, readOutlookState(query)),
    readGoalViews(query, now, timeZone),
    readTasks(query),
    // A new account (no goals, events or tasks, welcome never answered) sees the welcome (spec 13).
    welcomeDue(query),
  ]);
  return { display: displayOf(settings), week, goals, tasks: sortTasks(tasks), showWelcome };
}

/**
 * The calendar page with the contacts who share something with the user (spec 29), for the "People"
 * button: the same reads as loadCalendarPage, plus the people, in the same one transaction. Their events
 * themselves are read by the browser for the shown days (GET /api/shares/[id]/calendar).
 */
export async function loadCalendarPageWithShares(
  deps: PageDeps,
  userId: string,
  requestedDate?: string,
  requestedView?: View,
): Promise<CalendarPageData & { sharing: SharingPerson[] }> {
  await settleTasks(deps, userId);
  const now = deps.now();
  return deps.withUser(userId, async (query) => {
    // Without parameters, so started first (see the top of this file).
    const sharingRead = readSharingPeople(query);
    const [page, sharing] = await Promise.all([readCalendarPage(query, now, requestedDate, requestedView), sharingRead]);
    return { ...page, sharing };
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
  return deps.withUser(userId, (query) => readAnalyticsPage(query, now, requestedWeek));
}

async function readAnalyticsPage(query: Query, now: Date, requestedWeek?: string): Promise<AnalyticsPageData> {
  const settingsRead = readSettings(query);
  const [settings, analytics] = await Promise.all([
    settingsRead,
    readAnalytics(query, now, requestedWeek, settingsRead.then((s) => s.timeZone)),
  ]);
  return { display: displayOf(settings), analytics };
}

/**
 * The Analytics page with the contacts who share their focus chart with the user (spec 29): the same
 * reads as loadAnalyticsPage plus the people, in the same transaction. A chart itself is read by the
 * browser when the user picks a person (GET /api/shares/[id]/focus).
 */
export async function loadAnalyticsPageWithShares(
  deps: PageDeps,
  userId: string,
  requestedWeek?: string,
): Promise<AnalyticsPageData & { sharing: SharingPerson[] }> {
  const now = deps.now();
  await settleSessions(deps, userId, now);
  return deps.withUser(userId, async (query) => {
    const sharingRead = readSharingPeople(query);
    const [page, sharing] = await Promise.all([readAnalyticsPage(query, now, requestedWeek), sharingRead]);
    return { ...page, sharing: sharing.filter((p) => p.focus) };
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

/**
 * The settings page with the Profile card (spec 28): the same reads as loadSettingsPageAll, plus the
 * user's own profile (display name, address, photo), in the same one transaction.
 */
export async function loadSettingsPageWithProfile(deps: PageDeps, userId: string): Promise<SettingsPageLoad & { profile: OwnProfile }> {
  const now = deps.now();
  await settleSessions(deps, userId, now);
  return deps.withUser(userId, async (query) => {
    const settingsRead = readSettings(query);
    const profileRead = readOwnProfile(query);
    const [page, blocker, profile] = await Promise.all([
      readSettingsPage(query, now, settingsRead),
      readBlocker(query, now, settingsRead.then((s) => s.timeZone)),
      profileRead,
    ]);
    return { display: displayOf(page.settings), page, blocker, profile };
  });
}

export type PeoplePageData = { display: Display; timeZone: string; people: PeopleData; shares: ContactShares[] };

/**
 * The People page (spec 28): the user's profile, contacts and invitations; spec 29: per contact what the
 * user shares and what is shared with them. Reads only, one transaction.
 */
export async function loadPeoplePage(deps: Pick<Deps, "withUser">, userId: string): Promise<PeoplePageData> {
  return deps.withUser(userId, async (query) => {
    const [settings, people, shares] = await Promise.all([readSettings(query), readPeople(query), readSharesOverview(query)]);
    return { display: displayOf(settings), timeZone: settings.timeZone, people, shares };
  });
}

export type ListsPageData = { display: Display; lists: ListSummary[] };

/** The lists overview (spec 30): the user's own lists and those shared with them. Reads only, one transaction. */
export async function loadListsPage(deps: Pick<Deps, "withUser">, userId: string): Promise<ListsPageData> {
  return deps.withUser(userId, async (query) => {
    const [settings, lists] = await Promise.all([readSettings(query), readListSummaries(query, userId)]);
    return { display: displayOf(settings), lists };
  });
}

export type ListPageLoad = { display: Display; page: ListPageData };

const LIST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One list (spec 30) with its people and entries, and for its owner their contacts (the "Share" panel).
 * Null for a list the user may not use, a missing one and a malformed id alike (R55). One transaction.
 */
export async function loadListPage(deps: Pick<Deps, "withUser">, userId: string, listId: string): Promise<ListPageLoad | null> {
  if (!LIST_ID.test(listId)) return null;
  return deps.withUser(userId, async (query) => {
    // Reads without parameters first (one round), the list's reads (with a parameter) after them.
    const settingsRead = readSettings(query);
    const contactsRead = readShareContacts(query);
    const [settings, contacts, list] = await Promise.all([settingsRead, contactsRead, readListDetail(query, userId, listId)]);
    if (!list) return null;
    return { display: displayOf(settings), page: { list, contacts: list.isOwner ? contacts : [] } };
  });
}

/**
 * The coach's page (spec 19): the messages with their drafts, the events of the days the open draft
 * touches (to draw it in the calendar's style; spec 20: also the old day of a moved event), the goals with their look, the messages left today,
 * whether the chat is allowed for this user, and whether Claude is set up on this server.
 * One transaction; nothing is changed.
 */
export async function loadChatPage(deps: Pick<Deps, "withUser" | "assistant">, userId: string): Promise<ChatPageData> {
  return deps.withUser(userId, async (query) => {
    // Reads without parameters first (one round), the messages (with a parameter) after them.
    const settingsRead = readSettings(query);
    const goalsRead = readGoals(query);
    const accountRead = readChatAccount(query);
    const [settings, goals, account, messages] = await Promise.all([
      settingsRead,
      goalsRead,
      accountRead,
      readMessages(query, CHAT_PAGE_MESSAGES),
    ]);
    const timeZone = settings.timeZone;

    const open = messages.find((m) => m.draft?.status === "open")?.draft ?? null;
    const days = new Set<string>();
    const addDaysOf = (startAt: string, endAt: string) => {
      const start = localDateOf(new Date(startAt), timeZone);
      // An event ending at midnight does not touch the next day.
      const last = localDateOf(new Date(Date.parse(endAt) - 1), timeZone);
      for (let day = start; day <= last; day = addDays(day, 1)) days.add(day);
    };
    for (const e of open?.events ?? []) addDaysOf(e.startAt, e.endAt);
    // Spec 20: a moved event's old and new day, a deleted event's day.
    for (const c of open?.changes ?? []) {
      addDaysOf(c.oldStartAt, c.oldEndAt);
      if (c.startAt && c.endAt) addDaysOf(c.startAt, c.endAt);
    }
    // Spec 23: the day of an event the draft adds to-dos to (a timed event's start day, an all-day
    // event's first day), as the draft saw it.
    for (const t of open?.addedTodos ?? []) {
      if (t.startAt) days.add(localDateOf(new Date(t.startAt), timeZone));
      else if (t.firstDay) days.add(t.firstDay);
    }
    const draftDays = [...days].sort();
    let draftDayEvents: ChatPageData["draftDayEvents"] = [];
    if (draftDays.length > 0) {
      const first = draftDays[0];
      const last = draftDays[draftDays.length - 1];
      const rows = await query<EventRow>(
        `select ${EVENT_COLUMNS} from app.events
          where (not all_day and start_at < $2 and end_at > $1) or (all_day and last_day >= $3::date and first_day <= $4::date)
          order by coalesce(start_at, first_day::timestamptz), id`,
        [startOfLocalDate(first, timeZone), startOfLocalDate(addDays(last, 1), timeZone), first, last],
      );
      // Only the days the draft touches (the range may have gaps).
      draftDayEvents = rows
        .filter((r) => {
          if (r.all_day) return draftDays.some((d) => d >= r.first_day! && d <= r.last_day!);
          const from = localDateOf(new Date(r.start_at!), timeZone);
          const to = localDateOf(new Date(new Date(r.end_at!).getTime() - 1), timeZone);
          return draftDays.some((d) => d >= from && d <= to);
        })
        .map(toEventDto);
    }

    return {
      display: displayOf(settings),
      timeZone,
      messages,
      draftDayEvents,
      draftDays,
      goals: goals.map(({ goal }, index) => ({ id: goal.id, title: goal.title, look: lookOf(goal, index) })),
      messagesLeft: Math.max(0, DAILY_MESSAGES - account.usedToday),
      chatAllowed: chatAllowed(account.plan, chatProOnly()),
      assistantConfigured: deps.assistant !== null,
    };
  });
}

export type PricingPageData = { display: Display; plan: "free" | "pro"; paymentReady: boolean };

/** The pricing page (spec 24): the user's plan and whether payment is set up on this server. Reads only. */
export async function loadPricingPage(deps: Pick<Deps, "withUser" | "stripe">, userId: string): Promise<PricingPageData> {
  return deps.withUser(userId, async (query) => {
    const [[profile], settings] = await Promise.all([
      query<{ plan: "free" | "pro" }>("select plan from app.profiles"),
      readSettings(query),
    ]);
    return { display: displayOf(settings), plan: profile?.plan ?? "free", paymentReady: deps.stripe !== null };
  });
}
