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
import type { OwnProfile, PeopleData, PersonFacts, ProfileCardData } from "@/lib/profiles/types";
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
import { readContactsForGuests, readOwnProfile, readPeople } from "@/lib/server/profiles/cards";
import type { GuestPerson } from "@/lib/events/preview";
import { guestAddresses, matchGuests } from "@/lib/people/guest-match";
import { isUserId, readProfileCard, readProfileCards } from "@/lib/server/profiles/profile-card";
import { readSharesOverview, readSharingPeople } from "@/lib/server/shares/read";
import { cardsOfContacts, inviteContactsOf, openInvitesOf, readInvitedEvents, readOpenInviteRows, readOwnInvitees, readPendingInviteCount } from "@/lib/server/invites/read";
import type { CalendarInvites } from "@/lib/invites/types";
import { demoInviteFor, openDemoInvite } from "@/lib/demo/invite";
import { NOTHING_SHARED, type ContactShares, type PersonRelation, type ShareSetting, type SharingPerson } from "@/lib/shares/types";
import type { Query } from "@/lib/server/db";
import { demoContacts, demoPerson, demoProfileCard, demoSharingPeople, isDemoId, type DemoContact, type DemoProfileCard } from "@/lib/demo/people";
import { readDemoContactsOn } from "@/lib/server/demo/people";
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

/**
 * The real people who share with the user, then (spec 32) the demo contacts who share something, when
 * the user has them on. The demo people are never read from the database; only the choice is.
 */
function withDemoPeople(real: SharingPerson[], demoOn: boolean): SharingPerson[] {
  return demoOn ? [...real, ...demoSharingPeople()] : real;
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
 * themselves are read by the browser for the shown days (GET /api/shares/[id]/calendar). Spec 35: also
 * the guests of the shown events who are the user's own contacts (address → id, name, photo), for the
 * event preview; matched here, so no other address is looked up and none is sent.
 */
export async function loadCalendarPageWithShares(
  deps: PageDeps,
  userId: string,
  requestedDate?: string,
  requestedView?: View,
): Promise<CalendarPageData & { sharing: SharingPerson[]; guestPeople: Record<string, GuestPerson> }> {
  await settleTasks(deps, userId);
  const now = deps.now();
  return deps.withUser(userId, async (query) => (await readWithShares(query, now, requestedDate, requestedView)).page);
}

type WithShares = CalendarPageData & { sharing: SharingPerson[]; guestPeople: Record<string, GuestPerson> };

/** The reads of loadCalendarPageWithShares inside a transaction that is already open (also whether the demo contacts are on). */
async function readWithShares(query: Query, now: Date, requestedDate?: string, requestedView?: View): Promise<{ page: WithShares; demo: boolean }> {
  // Without parameters, so started first (see the top of this file).
  const sharingRead = readSharingPeople(query);
  const demoRead = readDemoContactsOn(query);
  const contactsRead = readContactsForGuests(query);
  const [page, sharing, demo, contacts] = await Promise.all([readCalendarPage(query, now, requestedDate, requestedView), sharingRead, demoRead, contactsRead]);
  // Spec 35: the guests of the shown events who are the user's contacts, for the event preview.
  const events = [...page.week.days.flatMap((d) => [...d.events, ...d.allDay]), ...page.week.lead];
  return { page: { ...page, sharing: withDemoPeople(sharing, demo), guestPeople: matchGuests(guestAddresses(events), contacts) }, demo };
}

/**
 * Spec 36: the calendar page with everything of loadCalendarPageWithShares, plus the event invitations,
 * in the same one transaction: the events of the shown days the user is invited to, the invitations
 * still to look at, how many are not answered (the badge), the invited people of the user's own shown
 * events (so the blocks and the preview need no extra request) and the user's contacts for the editor's
 * picker (contact row, name, photo; never an address). With the demo contacts on, Lea's one made-up
 * invitation is added (src/lib/demo/invite.ts).
 */
export async function loadCalendarPageWithInvites(
  deps: PageDeps,
  userId: string,
  requestedDate?: string,
  requestedView?: View,
): Promise<WithShares & { invites: CalendarInvites }> {
  await settleTasks(deps, userId);
  const now = deps.now();
  return deps.withUser(userId, async (query) => {
    // Without parameters, so started first (see the top of this file).
    const openRead = readOpenInviteRows(query);
    const pendingRead = readPendingInviteCount(query);
    const peopleRead = readPeople(query);
    const [{ page, demo }, openRows, pending, people] = await Promise.all([readWithShares(query, now, requestedDate, requestedView), openRead, pendingRead, peopleRead]);
    const cards = cardsOfContacts(people.contacts);
    const days = page.week.days.map((d) => d.date);
    const from = startOfLocalDate(days[0], page.week.timeZone);
    const to = startOfLocalDate(addDays(days[days.length - 1], 1), page.week.timeZone);
    const ownIds = [...new Set([...page.week.days.flatMap((d) => [...d.events, ...d.allDay]), ...page.week.lead].map((e) => e.id))];
    const [invited, own] = await Promise.all([readInvitedEvents(query, from, to, cards), readOwnInvitees(query, ownIds, cards)]);
    const demoShown = demo ? demoInviteFor(now, from, to) : null;
    const demoOpen = demo ? openDemoInvite(now) : null;
    return {
      ...page,
      invites: {
        invited: demoShown ? [...invited, demoShown] : invited,
        open: demoOpen ? [...openInvitesOf(openRows, cards), demoOpen] : openInvitesOf(openRows, cards),
        // The demo invitation's answer lives in the browser only, so the server's badge never counts it.
        pending,
        own,
        contacts: inviteContactsOf(people.contacts),
      },
    };
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
    const demoRead = readDemoContactsOn(query);
    const [page, sharing, demo] = await Promise.all([readAnalyticsPage(query, now, requestedWeek), sharingRead, demoRead]);
    return { ...page, sharing: withDemoPeople(sharing, demo).filter((p) => p.focus) };
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

export type PeoplePageData = {
  display: Display;
  timeZone: string;
  people: PeopleData;
  shares: ContactShares[];
  /** Spec 32: whether the user has the demo contacts on, and then the three of them (else none). */
  demo: { on: boolean; contacts: DemoContact[] };
  /** Spec 33: bio and time zone of the contacts and of the people who invited the user, for their cards. */
  facts: PersonFacts[];
  /** When the page was read (ISO), so the cards' local times start from the same minute on server and browser. */
  now: string;
};

/**
 * The People page (spec 28): the user's profile, contacts and invitations; spec 29: per contact what the
 * user shares and what is shared with them; spec 32: the demo contacts, after the real ones. Reads only,
 * one transaction.
 */
export async function loadPeoplePage(deps: Pick<Deps, "withUser"> & Partial<Pick<Deps, "now">>, userId: string): Promise<PeoplePageData> {
  const now = deps.now?.() ?? new Date();
  return deps.withUser(userId, async (query) => {
    const [settings, people, shares, demoOn] = await Promise.all([
      readSettings(query),
      readPeople(query),
      readSharesOverview(query),
      readDemoContactsOn(query),
    ]);
    // Spec 33: one more question (with a parameter, so after the others): the cards of these people.
    const cards = await readProfileCards(query, [...people.contacts, ...people.received].map((p) => p.userId));
    return {
      display: displayOf(settings),
      timeZone: settings.timeZone,
      people,
      shares,
      demo: { on: demoOn, contacts: demoOn ? demoContacts() : [] },
      facts: cards.map((card) => ({ userId: card.userId, bio: card.bio, timeZone: card.timeZone })),
      now: now.toISOString(),
    };
  });
}

export type ProfilePageData = {
  display: Display;
  /** The user's own card; its time zone is the one in their settings. */
  profile: ProfileCardData;
  /** When the page was read (ISO), so the clocks of server and browser start from the same minute. */
  now: string;
};

/** The user's own profile page (spec 31): their card and the display settings. Reads only, one transaction. */
export async function loadProfilePage(deps: PageDeps, userId: string): Promise<ProfilePageData> {
  const now = deps.now();
  return deps.withUser(userId, async (query) => {
    // The settings without parameters first, the card (with one) after them.
    const settingsRead = readSettings(query);
    const [settings, profile] = await Promise.all([settingsRead, readProfileCard(query, userId)]);
    if (!profile) throw new Error("The signed-in user has no profile.");
    return { display: displayOf(settings), profile, now: now.toISOString() };
  });
}

export type PersonPageData = {
  display: Display;
  /** The person's card as the user may see it. */
  person: ProfileCardData;
  /** The user's own shown name and photo, for the sidebar. */
  me: { name: string; photoUrl: string | null };
  now: string;
};

/**
 * Another person's profile (spec 31), read only. Null for anyone the user may not see (R43), a missing
 * user and a malformed id alike, so the page shows the same "Not found" for each. One transaction.
 */
export async function loadPersonPage(deps: PageDeps, userId: string, personId: string): Promise<PersonPageData | null> {
  if (!isUserId(personId)) return null;
  const now = deps.now();
  return deps.withUser(userId, async (query) => {
    const settingsRead = readSettings(query);
    const meRead = readOwnProfile(query);
    const [settings, me, person] = await Promise.all([settingsRead, meRead, readProfileCard(query, personId)]);
    if (!person) return null;
    return { display: displayOf(settings), person, me: { name: me.name, photoUrl: me.photoUrl }, now: now.toISOString() };
  });
}

export type DemoPersonPageData = {
  display: Display;
  /** The demo contact's card: no e-mail address, marked as a demo. */
  person: DemoProfileCard;
  /** What they share with the user. */
  shared: ShareSetting;
  me: { name: string; photoUrl: string | null };
  now: string;
};

/**
 * A demo contact's profile (spec 32), for one of the three fixed ids, only while the user has the demo
 * contacts on; null otherwise, the same as for any unknown id. One transaction.
 */
export async function loadDemoPersonPage(deps: PageDeps, userId: string, personId: string): Promise<DemoPersonPageData | null> {
  const person = isDemoId(personId) ? demoPerson(personId) : null;
  if (!person) return null;
  const now = deps.now();
  return deps.withUser(userId, async (query) => {
    const [settings, me, on] = await Promise.all([readSettings(query), readOwnProfile(query), readDemoContactsOn(query)]);
    if (!on) return null;
    return { display: displayOf(settings), person: demoProfileCard(person), shared: person.shares, me: { name: me.name, photoUrl: me.photoUrl }, now: now.toISOString() };
  });
}

/**
 * /people/[id]: one of the three demo ids is recognised first (spec 32), everything else goes to the
 * real person's loader, which checks the uuid. Null alike for everything the user may not see.
 */
export async function loadAnyPersonPage(deps: PageDeps, userId: string, personId: string): Promise<PersonPageData | DemoPersonPageData | null> {
  return isDemoId(personId) ? loadDemoPersonPage(deps, userId, personId) : loadPersonPage(deps, userId, personId);
}

export type PersonProfileData = {
  display: Display;
  /** The viewer's own time zone. */
  timeZone: string;
  person: ProfileCardData | DemoProfileCard;
  relation: PersonRelation | null;
  me: { name: string; photoUrl: string | null };
  now: string;
};

/**
 * /people/[id] with spec 33's sections ("What you share with …", their week, their focus chart): the
 * card as loadPersonPage and loadDemoPersonPage give it, plus the viewer's time zone and the relation.
 * The three demo ids are recognised first (spec 32). Null alike for everything the user may not see.
 * One transaction.
 */
export async function loadPersonProfile(deps: PageDeps, userId: string, personId: string): Promise<PersonProfileData | null> {
  const now = deps.now();
  if (isDemoId(personId)) {
    const person = demoPerson(personId);
    if (!person) return null;
    return deps.withUser(userId, async (query) => {
      const [settings, me, on] = await Promise.all([readSettings(query), readOwnProfile(query), readDemoContactsOn(query)]);
      if (!on) return null;
      return {
        display: displayOf(settings),
        timeZone: settings.timeZone,
        person: demoProfileCard(person),
        relation: { contactId: null, out: NOTHING_SHARED, shared: person.shares, demo: true },
        me: { name: me.name, photoUrl: me.photoUrl },
        now: now.toISOString(),
      };
    });
  }
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
      relation: contact ? { contactId: contact.id, out: shares?.out ?? NOTHING_SHARED, shared: shares?.in ?? NOTHING_SHARED, demo: false } : null,
      me: { name: people.me.name, photoUrl: people.me.photoUrl },
      now: now.toISOString(),
    };
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
