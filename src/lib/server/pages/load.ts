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
import { layoutOf } from "@/lib/analytics/layout";
import type { AnalyticsLayout, AnalyticsReport } from "@/lib/analytics/report-types";
import type { AnalyticsData } from "@/lib/analytics/types";
import { chatAllowed } from "@/lib/chat/access";
import type { ChatPageData } from "@/lib/chat/types";
import { lookOf } from "@/lib/goals/style";
import type { BlockerData } from "@/lib/blocker/types";
import type { OwnProfile, PeopleData, PersonFacts, ProfileCardData } from "@/lib/profiles/types";
import type { WeekData } from "@/lib/events/types";
import type { View } from "@/lib/events/views";
import type { FocusData } from "@/lib/focus/types";
import type { GoalView } from "@/lib/goals/types";
import type { SettingsPageData } from "@/lib/settings/types";
import type { TaskDto } from "@/lib/tasks/types";
import type { Display } from "@/lib/time/display";
import { readAnalytics } from "@/lib/server/analytics/load";
import { readAnalyticsReport } from "@/lib/server/analytics/report";
import { findOwnChat, readChatAccount, readChats, readMessages } from "@/lib/server/chat/rows";
import { chatProOnly } from "@/lib/server/config";
import { EVENT_COLUMNS, toEventDto, type EventRow } from "@/lib/server/events/rows";
import { readGoals } from "@/lib/server/goals/rows";
import { readBlocker } from "@/lib/server/blocker/page";
import type { Deps } from "@/lib/server/deps";
import type { Query } from "@/lib/server/db";
import { welcomeDue } from "@/lib/server/demo/rows";
import { readCalendar } from "@/lib/server/events/week";
import { settleSessions } from "@/lib/server/focus/sessions";
import { readFocus } from "@/lib/server/focus/load";
import { readGoalViews } from "@/lib/server/goals/load";
import { readOutlookState } from "@/lib/server/outlook/sync";
import { readOwnCard, readOwnProfile } from "@/lib/server/profiles/own-profile";
import { readPeople } from "@/lib/server/profiles/cards";
import { isUserId, readProfileCard, readProfileCards } from "@/lib/server/profiles/profile-card";
import { readSharesOverview, readSharingPeople } from "@/lib/server/shares/read";
import { NOTHING_SHARED, type ContactShares, type PersonRelation, type SharingPerson } from "@/lib/shares/types";
import { readDefaultView, readSettings } from "@/lib/server/settings";
import { readPlaces } from "@/lib/server/places/saved";
import type { SavedPlace } from "@/lib/places/saved";
import type { TravelMode } from "@/lib/settings/types";
import { readSettingsPage } from "@/lib/server/settings-page";
import { readTasks } from "@/lib/server/tasks/rows";
import { settleTasks } from "@/lib/server/tasks/settle";
import { sortTasks } from "@/lib/tasks/order";
import { addDays, localDateOf, startOfLocalDate, type LocalDate } from "@/lib/time/zoned";

type PageDeps = Pick<Deps, "withUser" | "now">;

/** How many of the latest messages the chat page shows. */
const CHAT_PAGE_MESSAGES = 100;
/** Spec 44: how many chats the coach's list shows at most (the newest). */
const CHAT_PAGE_CHATS = 200;

function displayOf(settings: { timeFormat: Display["timeFormat"]; dayStartHour: number; dayEndHour: number }): Display {
  return { timeFormat: settings.timeFormat, dayStartHour: settings.dayStartHour, dayEndHour: settings.dayEndHour };
}

export type CalendarPageData = { display: Display; week: WeekData; goals: GoalView[]; tasks: TaskDto[]; showWelcome: boolean; places: SavedPlace[]; home: string; travelMode: TravelMode };

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
  const [settings, week, { goals, tasks }, showWelcome, places] = await Promise.all([
    settingsRead,
    readCalendar(query, now, view, requestedDate, timeZone, readOutlookState(query)),
    readGoalsAndTasks(query, now, timeZone),
    // A new account (no goals, events or tasks, welcome never answered) sees the welcome (spec 13).
    welcomeDue(query),
    readPlaces(query),
  ]);
  return { display: displayOf(settings), week, goals, tasks, showWelcome, places, home: settings.homeAddress, travelMode: settings.travelMode };
}

/**
 * The calendar page with the contacts who share their calendar with the user (spec 53), for the
 * "People" button: the same reads as loadCalendarPage, plus the people, in the same one transaction.
 * Their events themselves are read by the browser for the shown days (GET /api/shares/[id]/calendar).
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

/**
 * The goals with their progress and look, and the tasks in R33's order. The calendar page and the
 * Goals page read them the same way. Both reads start at once (they have no parameters).
 */
function readGoalsAndTasks(query: Query, now: Date, timeZone: Promise<string>): Promise<{ goals: GoalView[]; tasks: TaskDto[] }> {
  return Promise.all([readGoalViews(query, now, timeZone), readTasks(query)]).then(([goals, tasks]) => ({ goals, tasks: sortTasks(tasks) }));
}

export type GoalsPageData = { display: Display; goals: GoalView[]; tasks: TaskDto[]; today: LocalDate };

/**
 * The Goals page (spec 39; before, the goals column beside the calendar): the goals with progress, the
 * tasks, and the user's local date (for overdue marks and the earliest due date). Reads only, apart
 * from removing old done tasks first (R33), as the calendar does.
 */
export async function loadGoalsPage(deps: PageDeps, userId: string): Promise<GoalsPageData> {
  const { display, goals, tasks, today } = await readGoalsPage(deps, userId, false);
  return { display, goals, tasks, today };
}

export type GoalsPageWithPlacesData = GoalsPageData & { places: SavedPlace[] };

/**
 * The Goals page with the user's saved places as well (spec 42: the guided questions and the goal
 * editor offer them as a goal's place). The same two transactions as loadGoalsPage; the places are read
 * in the same round as the settings.
 */
export function loadGoalsPageWithPlaces(deps: PageDeps, userId: string): Promise<GoalsPageWithPlacesData> {
  return readGoalsPage(deps, userId, true);
}

async function readGoalsPage(deps: PageDeps, userId: string, withPlaces: boolean): Promise<GoalsPageWithPlacesData> {
  // By itself: done tasks older than 7 days go first, saved on their own (R33).
  await settleTasks(deps, userId);
  const now = deps.now();
  return deps.withUser(userId, async (query) => {
    const settingsRead = readSettings(query);
    const timeZone = settingsRead.then((settings) => settings.timeZone);
    const [settings, places, { goals, tasks }] = await Promise.all([
      settingsRead,
      withPlaces ? readPlaces(query) : Promise.resolve([]),
      readGoalsAndTasks(query, now, timeZone),
    ]);
    return { display: displayOf(settings), goals, tasks, today: localDateOf(now, settings.timeZone), places };
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

/** The numbers of the first Analytics page (spec 06). Reads only, apart from finishing due sessions first (R13). */
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

export type AnalyticsTabsPageData = { display: Display; report: AnalyticsReport; layout: AnalyticsLayout; isStandardLayout: boolean };

/**
 * The Analytics page in tabs (spec 49): every number of the shown week and the user's layout of
 * widgets (the saved one, or the standard one). Reads only, apart from finishing due sessions first (R13).
 */
export async function loadAnalyticsTabsPage(deps: PageDeps, userId: string, requestedWeek?: string): Promise<AnalyticsTabsPageData> {
  const now = deps.now();
  await settleSessions(deps, userId, now);
  return deps.withUser(userId, async (query) => {
    // The reads without parameters go out first, together (see readAnalyticsReport).
    const settingsRead = readSettings(query);
    const goalsRead = readGoals(query);
    const savedRead = query<{ analytics_widgets: unknown }>("select analytics_widgets from app.settings");
    const [settings, saved, report] = await Promise.all([
      settingsRead,
      savedRead,
      readAnalyticsReport(query, now, requestedWeek, settingsRead.then((s) => s.timeZone), goalsRead),
    ]);
    const { layout, isStandard } = layoutOf(saved[0]?.analytics_widgets ?? null);
    return { display: displayOf(settings), report, layout, isStandardLayout: isStandard };
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
 * The settings page with the row "Your profile" at the top (spec 40): the same reads as
 * loadSettingsPageAll, plus the user's own name, address and photo, in the same one transaction.
 */
export async function loadSettingsPageWithProfile(deps: PageDeps, userId: string): Promise<SettingsPageLoad & { profile: OwnProfile }> {
  const now = deps.now();
  // By itself: due sessions finish first, so the blocker card shows the right state (R13, R15).
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

export type ProfilePageData = {
  display: Display;
  /** The user's own profile; its time zone is the one in their settings. */
  profile: ProfileCardData;
  /** When the page was read (ISO), so the clocks of server and browser start from the same minute. */
  now: string;
};

/** The user's own profile page (spec 40): their profile and the display settings. Reads only, one transaction. */
export async function loadProfilePage(deps: PageDeps, userId: string): Promise<ProfilePageData> {
  const now = deps.now();
  return deps.withUser(userId, async (query) => {
    const [settings, profile] = await Promise.all([readSettings(query), readOwnCard(query)]);
    return { display: displayOf(settings), profile, now: now.toISOString() };
  });
}

/**
 * Which chat the coach's page shows (spec 44): the user's latest chat (a new one when there is none),
 * a new, empty chat, or the chat with this id (a new one when it is not the user's or no longer exists).
 */
export type ChatChoice = "latest" | "new" | { id: string };

/**
 * The coach's page (spec 19): the user's chats for the list (spec 44), the messages of the chosen chat
 * with their drafts, the events of the days its open draft touches (to draw it in the calendar's style;
 * spec 20: also the old day of a moved event), the goals with their look, whether the chat is allowed
 * for this user, and whether Claude is set up on this server. One transaction; nothing is changed.
 */
export async function loadChatPage(
  deps: Pick<Deps, "withUser" | "assistant"> & Partial<Pick<Deps, "now">>,
  userId: string,
  choice: ChatChoice = "latest",
): Promise<ChatPageData> {
  return deps.withUser(userId, async (query) => {
    // Reads without parameters first (one round), the ones with a parameter after them.
    const settingsRead = readSettings(query);
    const goalsRead = readGoals(query);
    const accountRead = readChatAccount(query);
    const [settings, goals, account, chats, asked] = await Promise.all([
      settingsRead,
      goalsRead,
      accountRead,
      readChats(query, CHAT_PAGE_CHATS),
      typeof choice === "object" ? findOwnChat(query, choice.id) : Promise.resolve(null),
    ]);
    const chat = choice === "latest" ? (chats[0] ?? null) : asked;
    const messages = chat === null ? [] : await readMessages(query, chat.id, CHAT_PAGE_MESSAGES);
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
      chats,
      chatId: chat?.id ?? null,
      now: (deps.now?.() ?? new Date()).toISOString(),
      messages,
      draftDayEvents,
      draftDays,
      goals: goals.map(({ goal }, index) => ({ id: goal.id, title: goal.title, look: lookOf(goal, index) })),
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

export type PeoplePageData = {
  display: Display;
  timeZone: string;
  people: PeopleData;
  shares: ContactShares[];
  /** Bio and time zone of the contacts and of the people who invited the user, for their cards. */
  facts: PersonFacts[];
  /** When the page was read (ISO), so the cards' local times start from the same minute on server and browser. */
  now: string;
};

/**
 * The People page (spec 53): the user's profile, contacts and invitations, per contact what the user
 * shares and what is shared with them, and the cards' bio and time zone. Reads only, one transaction.
 */
export async function loadPeoplePage(deps: Pick<Deps, "withUser"> & Partial<Pick<Deps, "now">>, userId: string): Promise<PeoplePageData> {
  const now = deps.now?.() ?? new Date();
  return deps.withUser(userId, async (query) => {
    const [settings, people, shares] = await Promise.all([readSettings(query), readPeople(query), readSharesOverview(query)]);
    // One more question (with a parameter, so after the others): the cards of these people.
    const cards = await readProfileCards(query, [...people.contacts, ...people.received].map((p) => p.userId));
    return {
      display: displayOf(settings),
      timeZone: settings.timeZone,
      people,
      shares,
      facts: cards.map((card) => ({ userId: card.userId, bio: card.bio, timeZone: card.timeZone })),
      now: now.toISOString(),
    };
  });
}

export type PersonProfileData = {
  display: Display;
  /** The viewer's own time zone. */
  timeZone: string;
  person: ProfileCardData;
  relation: PersonRelation | null;
  me: { name: string; photoUrl: string | null };
  now: string;
};

/**
 * /people/[id] (spec 53): the person's card as app.profile_card gives it (R43), the viewer's time zone and
 * how the two stand (the contact row, what each shares with the other). Null alike for everything the
 * user may not see: a stranger, a removed contact, an unknown or a malformed id. One transaction.
 */
export async function loadPersonProfile(deps: PageDeps, userId: string, personId: string): Promise<PersonProfileData | null> {
  const now = deps.now();
  if (!isUserId(personId)) return null;
  return deps.withUser(userId, async (query) => {
    // Reads without parameters first (one round), the card (with one) after them.
    const settingsRead = readSettings(query);
    const peopleRead = readPeople(query);
    const overviewRead = readSharesOverview(query);
    const [settings, people, overview, person] = await Promise.all([settingsRead, peopleRead, overviewRead, readProfileCard(query, personId)]);
    if (!person) return null;
    const contact = people.contacts.find((c) => c.userId === person.userId);
    const shares = contact ? overview.find((o) => o.contactId === contact.id) : undefined;
    return {
      display: displayOf(settings),
      timeZone: settings.timeZone,
      person,
      relation: contact ? { contactId: contact.id, out: shares?.out ?? NOTHING_SHARED, shared: shares?.in ?? NOTHING_SHARED } : null,
      me: { name: people.me.name, photoUrl: people.me.photoUrl },
      now: now.toISOString(),
    };
  });
}
