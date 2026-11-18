// Development tool, not part of the app and not part of `npm test`: renders the calendar, the settings
// page and the account pages with sample data into stand-alone HTML files, so the look can be checked in a browser
// before a Supabase project exists. Nothing in src/ imports this file, and it starts no server.
//
// Run after a build (the compiled styles and fonts come from .next):
//   npm run build && PREVIEW_OUT=/some/folder npm run previews
// The sample week is made the real way: events go into the temporary test database and the week
// is read back with loadWeek, so conflicts and days are worked out by the app's own code.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { createTestApp, postJson } from "@test/support/app";
import { seedAllDay, seedEvent } from "@test/support/events";
import { seedGoal } from "@test/support/goals";

// Outside a running Next.js app there is no router: plain stand-ins for links and the router.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const ROOT = join(__dirname, "..", "..");
const OUT = process.env.PREVIEW_OUT ?? join(ROOT, "previews");

/** The built CSS with every font file inlined, and the class names that switch the fonts on. */
function builtStyles(): { css: string; fontClasses: string } {
  const chunks = join(ROOT, ".next", "static", "chunks");
  const files = readdirSync(chunks).filter((name) => name.endsWith(".css"));
  if (files.length === 0) throw new Error("No built CSS found. Run `npm run build` first.");
  let css = files.map((name) => readFileSync(join(chunks, name), "utf8")).join("\n");
  css = css.replace(/url\(\.\.\/media\/([^)]+)\)/g, (_match, file: string) => {
    const data = readFileSync(join(ROOT, ".next", "static", "media", file)).toString("base64");
    return `url(data:font/woff2;base64,${data})`;
  });
  const fontClasses = [...css.matchAll(/\.([A-Za-z_0-9-]+)\{--font-geist/g)].map((m) => m[1]).join(" ");
  return { css, fontClasses };
}

function page(title: string, body: string, styles: { css: string; fontClasses: string }, extraCss = ""): string {
  return `<!doctype html>
<html lang="en" class="${styles.fontClasses} antialiased">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} (preview)</title>
<style>${styles.css}</style>
<style>${extraCss}</style>
</head>
<body class="min-h-dvh">${body}</body>
</html>`;
}

/** Shows `html` inside a phone-sized frame, so the page's phone layout applies. */
function phoneFrame(title: string, html: string): string {
  const escaped = html.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${title} (preview)</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#e8e8ea;font:13px system-ui}
iframe{width:390px;height:844px;border:0;border-radius:36px;background:#fff;box-shadow:0 20px 60px -20px rgb(0 0 0/.35)}</style>
</head><body><iframe title="${title} at phone width" srcdoc="${escaped}"></iframe></body></html>`;
}

it("writes the preview files", async () => {
  const styles = builtStyles();
  const { Announcer } = await import("@/components/calendar/Announcer");
  const { CalendarView } = await import("@/components/calendar/CalendarView");
  const { GoalsPage } = await import("@/components/goals/GoalsPage");
  const { GoalEditor } = await import("@/components/goals/GoalEditor");
  const { loadGoals } = await import("@/lib/server/goals/load");
  const { loadTasks } = await import("@/lib/server/tasks/load");
  const { EditEventCard, NewEventCard, SeriesQuestion } = await import("@/components/calendar/EventEditor");
  const { AppShell } = await import("@/components/shell/AppShell");
  const { default: SignInPage } = await import("@/app/(account)/sign-in/page");
  const { default: SignUpPage } = await import("@/app/(account)/sign-up/page");
  const { loadCalendar, loadWeek } = await import("@/lib/server/events/week");

  // A sample week for Monday 16 to Sunday 22 November 2026, seen on Tuesday at 12:10 in Lisbon.
  const app = await createTestApp();
  const user = await app.signedInAs("preview@example.com", { timeZone: "Europe/Lisbon" });
  // Three goals, created in earlier weeks, so the strips have history.
  const exam = await seedGoal(app.db, user, {
    title: "Pass the statistics exam",
    deadline: "2026-12-18",
    createdAt: "2026-10-26T10:00:00Z",
    rules: [{ kind: "hours", target: 6 }],
  });
  const run = await seedGoal(app.db, user, {
    title: "Run a half marathon",
    deadline: "2027-03-14",
    createdAt: "2026-11-03T10:00:00Z",
    autoBlock: true,
    rules: [{ kind: "count", target: 2, minMinutes: 45 }],
  });
  const project = await seedGoal(app.db, user, {
    title: "Finish the group project",
    deadline: "2026-11-28",
    createdAt: "2026-11-09T10:00:00Z",
    rules: [{ kind: "count", target: 3 }],
  });
  // Spec 13: each goal's own colour, icon and reason; the project keeps no saved colour, so it shows
  // the colour calculated from its place in the list (third: violet).
  await app.db.admin("update app.goals set color = 'indigo', icon = 'graduation', why = 'A good grade frees up the summer.' where id = $1", [exam.id]);
  await app.db.admin("update app.goals set color = 'teal', icon = 'footprints', why = 'Stay fit, even when the semester gets busy.' where id = $1", [run.id]);
  await app.db.admin("update app.goals set icon = 'briefcase' where id = $1", [project.id]);
  type Extra = { mayOverlap?: boolean; status?: "planned" | "done"; goalId?: string };
  const add = (title: string, start: string, end: string, extra: Extra = {}) =>
    seedEvent(app.db, user, { title, start: `2026-${start}:00Z`, end: `2026-${end}:00Z`, ...extra });
  // Earlier weeks, for the strips: the exam goal met in one week and missed in another; one run (A1-like) last week.
  await add("Revision", "10-27T09:00", "10-27T15:00", { status: "done", goalId: exam.id });
  await add("Revision", "11-03T09:00", "11-03T11:00", { status: "done", goalId: exam.id });
  await add("Revision", "11-10T09:00", "11-10T15:30", { status: "done", goalId: exam.id });
  await add("Run", "11-10T07:00", "11-10T07:50", { status: "done", goalId: run.id });
  await add("Run", "11-12T07:00", "11-12T07:40", { status: "done", goalId: run.id });
  await add("Project work", "11-11T14:00", "11-11T16:00", { status: "done", goalId: project.id });
  // This week.
  await add("Statistics lecture", "11-16T09:00", "11-16T10:30", { status: "done", goalId: exam.id });
  await add("Gym", "11-16T18:00", "11-16T19:00", { status: "done" });
  await add("Statistics revision", "11-17T09:00", "11-17T11:00", { status: "done", goalId: exam.id });
  await add("Call with Lucas", "11-17T10:00", "11-17T10:30");
  await add("Lunch with Emily", "11-17T12:30", "11-17T13:30");
  const groupProject = await add("Group project", "11-17T14:00", "11-17T19:00", { goalId: project.id });
  // Spec 16: an app event with a location (its block is tall enough to show it).
  await app.db.admin("update app.events set location = 'Library, floor 2' where id = $1", [groupProject.id]);
  await add("Coffee", "11-18T08:00", "11-18T08:15");
  await add("Half-marathon training", "11-18T18:00", "11-18T19:30", { goalId: run.id });
  await add("Lab session", "11-19T10:00", "11-19T12:00", { goalId: exam.id });
  await add("Night shift at the library", "11-19T22:00", "11-20T02:00");
  await add("Team meeting", "11-20T15:00", "11-20T16:00", { mayOverlap: true, goalId: project.id });
  await add("Study group", "11-20T15:30", "11-20T16:30", { mayOverlap: true, goalId: exam.id });
  await add("Long run", "11-21T08:30", "11-21T10:00", { goalId: run.id });
  // Spec 07: two all-day events and a weekly series (Monday and Wednesday 16:00 to 17:00).
  await seedAllDay(app.db, user, { title: "Exam week", firstDay: "2026-11-18", lastDay: "2026-11-20" });
  await seedAllDay(app.db, user, { title: "Trip to Porto", firstDay: "2026-11-21", lastDay: "2026-11-22" });
  await seedAllDay(app.db, user, { title: "Library closed", firstDay: "2026-11-20", lastDay: "2026-11-20" });
  for (const day of ["11-16", "11-18", "11-23", "11-25"]) {
    await app.db.admin(
      "insert into app.events (user_id, title, start_at, end_at, series_id) values ($1, 'Statistics tutorial', $2, $3, 'a7c1e0f2-3b4d-4e5f-8a9b-0c1d2e3f4a5b')",
      [user, `2026-${day}T16:00:00Z`, `2026-${day}T17:00:00Z`],
    );
  }
  // Spec 08: Outlook connected and synced at 08:40; two Outlook events; the app's events are in
  // Outlook except one added while Outlook was down.
  await app.db.withUser(user, async (q) => {
    await q("select app.outlook_connect('v1.preview.preview')");
    await q("select app.outlook_import($1, $2, $3::jsonb)", [
      "2026-11-09T00:00:00Z",
      "2027-01-15T00:00:00Z",
      JSON.stringify([
        { outlook_id: "AAMk-ethics", title: "Business ethics seminar", all_day: false, start_at: "2026-11-19T14:00:00Z", end_at: "2026-11-19T15:30:00Z", location: "Nova SBE, room B-201" },
        { outlook_id: "AAMk-holiday", title: "Faculty holiday", all_day: true, first_day: "2026-11-16", last_day: "2026-11-16" },
      ]),
    ]);
  });
  await app.db.admin("update app.events set outlook_id = 'AAMk-' || left(id::text, 8), outlook_sent_version = updated_at where source = 'app' and user_id = $1", [user]);
  await app.db.admin("update app.calendar_connections set last_synced_at = '2026-11-17T08:40:00Z'");
  await add("Thesis meeting", "11-18T11:00", "11-18T11:45");
  // Spec 11: tasks under the goals and in the Inbox; "today" is Tuesday 17 November, so 16 November is overdue.
  const task = (title: string, goalId: string | null, dueDate: string | null, status: "open" | "done" = "open") =>
    app.db.admin("insert into app.tasks (user_id, title, goal_id, due_date, status) values ($1, $2, $3, $4, $5)", [user, title, goalId, dueDate, status]);
  await task("Read chapter 7 on regression", exam.id, "2026-11-16");
  await task("Write a formula sheet", exam.id, "2026-11-19");
  await task("Do a practice exam", exam.id, null);
  await task("Book a seat in the exam hall", exam.id, "2026-11-13", "done");
  await task("Buy running shoes", run.id, "2026-11-20");
  await task("Sign up for the race", run.id, null, "done");
  await task("Send the slides to Emily", project.id, "2026-11-18");
  await task("Call mom back", null, "2026-11-22");
  await task("Renew passport", null, "2026-11-26");
  await task("Pay the rent", null, null, "done");
  app.advance(27 * 60 * 60 * 1000 + 10 * 60 * 1000); // Tuesday 17 November, 12:10
  const week = await loadWeek(app.deps, user, "2026-11-16");
  // Spec 14: the same data as one day (Thursday, with the night shift running into Friday) and as the month.
  const dayData = await loadCalendar(app.deps, user, "day", "2026-11-17");
  const fridayData = await loadCalendar(app.deps, user, "day", "2026-11-20");
  const monthData = await loadCalendar(app.deps, user, "month", "2026-11-17");
  const goals = await loadGoals(app.deps, user);
  const tasks = await loadTasks(app.deps, user);
  await app.close();

  const calendar = (shown = week) =>
    renderToStaticMarkup(
      <Announcer>
        <AppShell current="/">
          <CalendarView
            week={shown}
            nowLocal="2026-11-17T12:10"
            goals={goals.map(({ id, title, look }) => ({ id, title, look }))}
            outlookAvailable
          />
        </AppShell>
      </Announcer>,
    );

  mkdirSync(OUT, { recursive: true });
  const weekHtml = page("Week", calendar(), styles);
  writeFileSync(join(OUT, "week-desktop.html"), weekHtml);
  writeFileSync(join(OUT, "week-phone.html"), phoneFrame("Week", weekHtml));
  for (const [name, data] of [["day", dayData], ["day-friday", fridayData], ["month", monthData]] as const) {
    const html = page(name, calendar(data), styles);
    writeFileSync(join(OUT, `${name}-desktop.html`), html);
    writeFileSync(join(OUT, `${name}-phone.html`), phoneFrame(name, html));
  }

  // Spec 16: the editor as the prototype's 360 px card next to the block it belongs to. A static page
  // cannot run the panel's placement, so a small script applies the same rules (right of the block, else
  // left of it, kept inside the window) once the page is laid out. On phones it is a sheet from below.
  const goalLabels = goals.map(({ id, title, look }) => ({ id, title, look }));
  const editorProps = { goals: goalLabels, timeZone: "Europe/Lisbon", today: "2026-11-17", anchor: null, onClose: () => {} };
  const floatingEditor = (selector: string, inner: string) =>
    `<div id="floating-editor" class="scroll-thin fixed z-50 overflow-y-auto overscroll-contain rounded-card border border-line-subtle bg-surface shadow-float" style="left:0;top:0;width:360px;max-height:calc(100dvh - 16px);visibility:hidden">${inner}</div>
<script>(function(){var p=document.getElementById("floating-editor"),b=document.querySelector(${JSON.stringify(selector)});if(!b)return;var a=b.getBoundingClientRect(),vw=innerWidth,vh=innerHeight,w=Math.min(360,vw-16),l=a.right+10;if(l+w>vw-8)l=a.left-w-10;l=Math.max(8,Math.min(l,vw-w-8));var t=Math.max(8,Math.min(a.top,vh-p.offsetHeight-8));p.style.left=l+"px";p.style.top=t+"px";p.style.width=w+"px";p.style.visibility="visible";})();</script>`;
  const editorSheet = (inner: string) =>
    `<div class="fixed inset-0 z-50 flex flex-col justify-end"><div class="absolute inset-0 bg-ink/20"></div><div role="dialog" aria-modal="true" class="scroll-thin relative max-h-[88dvh] overflow-y-auto overscroll-contain rounded-t-panel border-t border-line-subtle bg-surface pb-[max(12px,env(safe-area-inset-bottom))] shadow-pop"><div class="relative flex h-10 items-center justify-center"><div class="h-1 w-9 rounded-full bg-muted"></div></div>${inner}</div></div>`;
  const blockOf = (id: string) => `[data-event-id="${id}"]`;

  // The editor open on the done revision of the exam goal (compare with the prototype's event panel).
  const revision = week.days[1].events.find((e) => e.title === "Statistics revision")!;
  const editorMarkup = renderToStaticMarkup(<EditEventCard event={revision} {...editorProps} />);
  writeFileSync(join(OUT, "event-editor.html"), page("Event editor", `${calendar()}${floatingEditor(blockOf(revision.id), editorMarkup)}`, styles));
  writeFileSync(join(OUT, "event-editor-phone.html"), phoneFrame("Event editor", page("Event editor", `${calendar(dayData)}${editorSheet(editorMarkup)}`, styles)));

  // An app event with a location: the field is filled, and the tall block shows the location line.
  const groupEvent = week.days[1].events.find((e) => e.title === "Group project")!;
  writeFileSync(
    join(OUT, "event-editor-location.html"),
    page("Location", `${calendar()}${floatingEditor(blockOf(groupEvent.id), renderToStaticMarkup(<EditEventCard event={groupEvent} {...editorProps} />))}`, styles),
  );

  // A new event from "Add details" with the repeat choice (weekly; Tuesday is the first date's day).
  const repeatMarkup = renderToStaticMarkup(
    <NewEventCard draft={{ start: "2026-11-17T15:00", end: "2026-11-17T16:00", repeat: "weekly", title: "Statistics practice", goalId: revision.goalId }} {...editorProps} />,
  );
  writeFileSync(join(OUT, "event-editor-repeat.html"), page("Repeat", `${calendar()}${floatingEditor(blockOf(groupEvent.id), repeatMarkup)}`, styles));

  // An all-day event in the editor.
  const examWeek = week.days[2].allDay.find((e) => e.title === "Exam week")!;
  const allDayMarkup = renderToStaticMarkup(<EditEventCard event={examWeek} {...editorProps} />);
  writeFileSync(join(OUT, "event-editor-all-day.html"), page("All day", `${calendar()}${floatingEditor('[aria-label^="Exam week"]', allDayMarkup)}`, styles));

  // The question after Delete on an event of a series (the footer as it looks then).
  const tutorial = week.days[0].events.find((e) => e.title === "Statistics tutorial")!;
  const seriesMarkup = renderToStaticMarkup(<EditEventCard event={tutorial} {...editorProps} />).replace(
    /(<div class="sticky bottom-0[^"]*">).*(<\/div><\/div>)$/s,
    (_m, open: string, close: string) =>
      `${open}${renderToStaticMarkup(<SeriesQuestion kind="delete" title={tutorial.title} busy={false} onAnswer={() => {}} onCancel={() => {}} />)}${close}`,
  );
  if (!seriesMarkup.includes("This and following events")) throw new Error("series question not placed");
  writeFileSync(join(OUT, "event-editor-series.html"), page("Series", `${calendar()}${floatingEditor(blockOf(tutorial.id), seriesMarkup)}`, styles));

  // An Outlook event in the editor (R11: title, time and location as text), and the Outlook panel in its three states.
  const ethics = week.days[3].events.find((e) => e.title === "Business ethics seminar")!;
  const outlookEditorMarkup = renderToStaticMarkup(<EditEventCard event={ethics} {...editorProps} />);
  writeFileSync(join(OUT, "event-editor-outlook.html"), page("Outlook event", `${calendar()}${floatingEditor(blockOf(ethics.id), outlookEditorMarkup)}`, styles));

  // Spec 15: the small "New event" card after a drag on Wednesday 3 to 4:30pm (a static page cannot
  // run the drag, so the card is placed where the pointer would be released), as a sheet on phones.
  const { NewEventForm } = await import("@/components/calendar/NewEventPopover");
  const { ToastBar } = await import("@/components/calendar/CalendarView");
  const cardMarkup = renderToStaticMarkup(
    <NewEventForm date="2026-11-18" startMin={15 * 60} endMin={16 * 60 + 30} goals={goalLabels} onClose={() => {}} onOpenEditor={() => {}} />,
  );
  const floating = (left: number, top: number) =>
    `<div role="dialog" aria-label="New event" class="scroll-thin fixed z-50 overflow-y-auto overscroll-contain rounded-card border border-line-subtle bg-surface shadow-float" style="left:${left}px;top:${top}px;width:320px">${cardMarkup}</div>`;
  const sheet = `<div class="fixed inset-0 z-50 flex flex-col justify-end"><div class="absolute inset-0 bg-ink/20"></div><div role="dialog" aria-modal="true" aria-label="New event" class="scroll-thin relative max-h-[88dvh] overflow-y-auto overscroll-contain rounded-t-panel border-t border-line-subtle bg-surface pb-[max(12px,env(safe-area-inset-bottom))] shadow-pop"><div class="relative flex h-10 items-center justify-center"><div class="h-1 w-9 rounded-full bg-muted"></div></div>${cardMarkup}</div></div>`;
  writeFileSync(join(OUT, "new-event-card.html"), page("New event", `${calendar()}${floating(860, 330)}`, styles));
  writeFileSync(join(OUT, "new-event-card-phone.html"), phoneFrame("New event", page("New event", `${calendar(dayData)}${sheet}`, styles)));
  // Spec 15: the undo toast after a move, and after a delete.
  const toast = (text: string) => renderToStaticMarkup(<ToastBar toast={{ id: 1, text, undo: () => {} }} onDone={() => {}} />);
  writeFileSync(join(OUT, "undo-toast.html"), page("Undo", `${calendar()}${toast("Moved to Thu, Nov 19, 2 – 3pm")}`, styles));
  writeFileSync(join(OUT, "undo-toast-phone.html"), phoneFrame("Undo", page("Undo", `${calendar(dayData)}${toast("Event deleted")}`, styles)));

  // Spec 12: the settings page in the prototype's layout (Outlook not set up on this server, blocker not
  // connected), the Outlook card in its other states, the delete question, and the page at phone width.
  const { SettingsView } = await import("@/components/settings/SettingsView");
  const { OutlookCard } = await import("@/components/settings/OutlookCard");
  const { YourAccountCard } = await import("@/components/settings/YourAccountCard");
  type SettingsPageData = import("@/lib/settings/types").SettingsPageData;
  const settingsData: SettingsPageData = {
    settings: { timeZone: "Europe/Lisbon", homeAddress: "Rua Augusta 100, Lisbon", travelMode: "cycling", travelBufferMinutes: 10, timeFormat: "12h", dayStartHour: 7, dayEndHour: 21 },
    plan: "free",
    outlookAvailable: false,
    outlook: { status: "none", lastSyncedAt: null },
    today: "2026-11-17",
    hasDemo: true,
    defaultView: "week",
    places: [],
  };
  const settingsBlocker = {
    sites: ["youtube.com", "instagram.com", "tiktok.com", "x.com", "reddit.com", "facebook.com"].map((domain, i) => ({ id: String(i), domain })),
    connected: false,
    blockingOn: false,
    blockingUntil: null,
    timeZone: "Europe/Lisbon",
  };
  const settingsPage = (data: SettingsPageData) =>
    renderToStaticMarkup(
      <Announcer>
        <AppShell current="/settings">
          <SettingsView data={data} blocker={settingsBlocker} />
        </AppShell>
      </Announcer>,
    );
  const settingsHtml = page("Settings", settingsPage(settingsData), styles);
  writeFileSync(join(OUT, "settings.html"), settingsHtml);
  writeFileSync(join(OUT, "settings-phone.html"), phoneFrame("Settings", settingsHtml));
  const outlookState = (label: string, outlook: SettingsPageData["outlook"], confirming = false) => `
    <div class="flex flex-col gap-2"><p class="text-xs font-medium text-ink-3">${label}</p>${renderToStaticMarkup(
      <Announcer>
        <OutlookCard outlook={outlook} outlookAvailable today="2026-11-17" timeZone="Europe/Lisbon" defaultConfirming={confirming} />
      </Announcer>,
    )}</div>`;
  writeFileSync(
    join(OUT, "settings-outlook.html"),
    page(
      "Outlook card",
      `<main class="flex max-w-3xl flex-col gap-6 bg-canvas p-6">${[
        outlookState("Set up on this server, not connected", { status: "none", lastSyncedAt: null }),
        outlookState("Connected", { status: "connected", lastSyncedAt: "2026-11-17T08:40:00.000Z" }),
        outlookState("Microsoft refused the stored access", { status: "needs_reconnect", lastSyncedAt: "2026-11-16T17:05:00.000Z" }),
        outlookState("After Disconnect", { status: "connected", lastSyncedAt: "2026-11-17T08:40:00.000Z" }, true),
      ].join("")}<div class="flex flex-col gap-2"><p class="text-xs font-medium text-ink-3">After Delete account</p>${renderToStaticMarkup(<YourAccountCard defaultAsking />)}</div><div class="flex flex-col gap-2"><p class="text-xs font-medium text-ink-3">After Remove the demo data (spec 13)</p>${renderToStaticMarkup(<YourAccountCard hasDemo defaultAskingDemo />)}</div></main>`,
      styles,
    ),
  );

  // Spec 10: goal sections in the states the sample week does not show: a met rule, a collapsed
  // section and a passed deadline.
  const { GoalCard } = await import("@/components/goals/GoalCard");
  const [first, second, third] = goals;
  const met = { ...first, progress: { ...first.progress, thisWeek: first.progress.thisWeek.map((r) => ({ ...r, text: "This week: 6 of 6 h", status: "met" as const })) } };
  const passed = { ...third, progress: { ...third.progress, countdown: "Deadline passed" } };
  writeFileSync(
    join(OUT, "goal-sections.html"),
    page(
      "Goal sections",
      `<main class="flex flex-col gap-3 bg-canvas p-6" style="width:280px">${renderToStaticMarkup(
        <>
          <GoalCard goal={met} onOpen={() => {}} onToggle={() => {}} />
          <GoalCard goal={second} onOpen={() => {}} onToggle={() => {}} collapsed />
          <GoalCard goal={passed} onOpen={() => {}} onToggle={() => {}} />
        </>,
      )}</main>`,
      styles,
    ),
  );

  // Spec 11: the small task forms, open for adding (Inbox) and for editing a task with a rejection.
  const { TaskForm } = await import("@/components/goals/TaskList");
  const goalOptions = goals.map(({ id, title }) => ({ id, title }));
  const shoes = tasks.find((t) => t.title === "Buy running shoes")!;
  writeFileSync(
    join(OUT, "task-forms.html"),
    page(
      "Task forms",
      `<main class="flex flex-col gap-3 bg-canvas p-6" style="width:280px">${renderToStaticMarkup(
        <Announcer>
          <TaskForm mode={{ kind: "add", sectionTitle: "Inbox" }} goalId={null} today="2026-11-17" goals={goalOptions} onDone={() => {}} />
          <TaskForm mode={{ kind: "edit", task: shoes }} goalId={shoes.goalId} today="2026-11-17" goals={goalOptions} onDone={() => {}} />
        </Announcer>,
      )}</main>`,
      styles,
    ),
  );

  // Spec 39: the Goals page with tasks, on a wide screen and at phone width.
  const goalsPageMarkup = renderToStaticMarkup(
    <Announcer>
      <AppShell current="/goals">
        <GoalsPage goals={goals} tasks={tasks} today="2026-11-17" />
      </AppShell>
    </Announcer>,
  );
  writeFileSync(join(OUT, "goals-page.html"), page("Goals", goalsPageMarkup, styles));
  writeFileSync(join(OUT, "goals-tasks-phone.html"), phoneFrame("Goals with tasks", page("Goals with tasks", goalsPageMarkup, styles)));

  // The goal editor, open for a new goal (same static-dialog treatment as the event editor).
  const goalEditorMarkup = renderToStaticMarkup(<GoalEditor state={{ mode: "create", today: "2026-11-17", color: "rose" }} onClose={() => {}} />).replace(
    "<dialog",
    "<dialog open",
  );
  const centred = `.preview-dim{position:fixed;inset:0;background:rgb(16 16 16/.2);z-index:65}
dialog.event-editor[open]{position:fixed;inset:auto 0 0 0;z-index:70;animation:none}
@media (min-width:640px){dialog.event-editor[open]{inset:0;margin:auto;height:fit-content}}`;
  writeFileSync(
    join(OUT, "goal-editor.html"),
    page("Goal editor", `${calendar()}<div class="preview-dim"></div>${goalEditorMarkup}`, styles, centred),
  );
  // Spec 13: the goal editor open on an existing goal (its colour, icon and why filled in).
  const goalEditMarkup = renderToStaticMarkup(
    <GoalEditor state={{ mode: "edit", goal: goals.find((g) => g.title === "Run a half marathon")!, today: "2026-11-17" }} onClose={() => {}} />,
  ).replace("<dialog", "<dialog open");
  writeFileSync(join(OUT, "goal-editor-edit.html"), page("Goal editor", `${calendar()}<div class="preview-dim"></div>${goalEditMarkup}`, styles, centred));
  writeFileSync(
    join(OUT, "goal-editor-phone.html"),
    phoneFrame("Goal editor", page("Goal editor", `${calendar()}<div class="preview-dim"></div>${goalEditMarkup}`, styles, centred)),
  );

  // Spec 42: the guided setup of a new goal over the Goals page, on each question, the review and the
  // celebration (its animations run once when the file opens). Static, like the welcome: `open` and a
  // dimmed, blurred layer behind it.
  const { GoalSetup } = await import("@/components/goals/setup/GoalSetup");
  const { chooseCategory, emptyAnswers } = await import("@/lib/goals/setup");
  const setupCss = `.preview-dim{position:fixed;inset:0;background:rgb(16 16 16/.3);backdrop-filter:blur(2px);z-index:65}
dialog.goal-setup[open]{position:fixed;inset:auto 0 0 0;z-index:70}
@media (min-width:768px){dialog.goal-setup[open]{inset:0;margin:auto;height:fit-content}}`;
  const gymPlace = { id: "p1", name: "Gym", address: "FitnessHut Lisboa, Av. da Liberdade 144" };
  type SetupAnswers = import("@/lib/goals/setup").SetupAnswers;
  const gymAnswers: Partial<SetupAnswers> = {
    ...chooseCategory(emptyAnswers("teal"), "sport"),
    title: "Gym",
    place: { kind: "saved", ...gymPlace },
    dayPart: "evening",
    avoidDays: [5],
    hasDate: true,
    deadline: "2026-12-12",
  };
  const setupScreens: [string, Parameters<typeof GoalSetup>[0]["initialScreen"], Partial<SetupAnswers>][] = [
    ["goal-setup-1.html", "category", {}],
    ["goal-setup-1-named.html", "category", gymAnswers],
    ["goal-setup-2.html", "often", gymAnswers],
    ["goal-setup-3.html", "place", gymAnswers],
    ["goal-setup-4.html", "when", { ...gymAnswers, dayPart: null }],
    ["goal-setup-5.html", "days", gymAnswers],
    ["goal-setup-5-blocked.html", "days", { ...gymAnswers, timesPerWeek: 5, avoidDays: [1, 2, 3, 4] }],
    ["goal-setup-6.html", "date", gymAnswers],
    ["goal-setup-review.html", "review", gymAnswers],
    ["goal-setup-done.html", "done", gymAnswers],
  ];
  for (const [file, screen, answers] of setupScreens) {
    const setup = renderToStaticMarkup(
      <GoalSetup open onClose={() => {}} onUseForm={() => {}} goals={goals} places={[gymPlace]} today="2026-11-17" initialScreen={screen} initialAnswers={answers} />,
    ).replace("<dialog", "<dialog open");
    const html = page("New goal", `${goalsPageMarkup}<div class="preview-dim"></div>${setup}`, styles, setupCss);
    writeFileSync(join(OUT, file), html);
    if (file === "goal-setup-2.html" || file === "goal-setup-done.html") writeFileSync(join(OUT, file.replace(".html", "-phone.html")), phoneFrame("New goal", html));
  }

  // Spec 13: the demo week. A new account chooses "Explore the demo" on Wednesday 18 November at 13:00 in
  // Lisbon; the calendar, the Goals page and the Focus page then show what load_demo created.
  const { loadDemo } = await import("@/lib/server/actions/load-demo");
  const { Welcome } = await import("@/components/shell/Welcome");
  const demoApp = await createTestApp();
  const demoUser = await demoApp.signedInAs("demo@example.com", { timeZone: "Europe/Lisbon" });
  demoApp.advance(2 * 24 * 3_600_000 + 4 * 3_600_000);
  const emptyWeek = await loadWeek(demoApp.deps, demoUser);
  const demoAnswer = await loadDemo(postJson("/api/demo/load", {}), demoApp.deps);
  if (demoAnswer.status !== 201) throw new Error(`load_demo failed: ${demoAnswer.status}`);
  const demoWeek = await loadWeek(demoApp.deps, demoUser);
  const demoGoals = await loadGoals(demoApp.deps, demoUser);
  const demoTasks = await loadTasks(demoApp.deps, demoUser);
  await demoApp.close();
  const demoCalendar = (w: typeof demoWeek, g: typeof demoGoals, after = "") =>
    renderToStaticMarkup(
      <Announcer>
        <AppShell current="/">
          <CalendarView
            week={w}
            nowLocal="2026-11-18T13:00"
            goals={g.map(({ id, title, look }) => ({ id, title, look }))}
            outlookAvailable
          />
        </AppShell>
      </Announcer>,
    ) + after;
  const demoHtml = page("Demo week", demoCalendar(demoWeek, demoGoals), styles);
  writeFileSync(
    join(OUT, "demo-goals.html"),
    page(
      "Demo goals",
      renderToStaticMarkup(
        <Announcer>
          <AppShell current="/goals">
            <GoalsPage goals={demoGoals} tasks={demoTasks} today="2026-11-18" />
          </AppShell>
        </Announcer>,
      ),
      styles,
    ),
  );
  writeFileSync(join(OUT, "demo-week.html"), demoHtml);
  writeFileSync(join(OUT, "demo-week-phone.html"), phoneFrame("Demo week", demoHtml));

  // The welcome over the new account's empty calendar, in each step. A static page cannot open a
  // modal dialog, so it gets the `open` attribute and a dimmed, blurred layer behind it.
  const welcomeCss = `.preview-dim{position:fixed;inset:0;background:rgb(16 16 16/.3);backdrop-filter:blur(2px);z-index:65}
dialog.welcome[open]{position:fixed;inset:auto 0 0 0;z-index:70;animation:none}
@media (min-width:768px){dialog.welcome[open]{inset:0;margin:auto;height:fit-content}}`;
  for (const step of [1, 2, 3] as const) {
    const welcome = renderToStaticMarkup(<Welcome timeFormat="12h" defaultStep={step} />).replace("<dialog", "<dialog open");
    const html = page("Welcome", demoCalendar(emptyWeek, [], `<div class="preview-dim"></div>${welcome}`), styles, welcomeCss);
    writeFileSync(join(OUT, `welcome-${step}.html`), html);
    if (step === 1) writeFileSync(join(OUT, "welcome-phone.html"), phoneFrame("Welcome", html));
  }

  // The Focus page in its states (spec 04). Sample sessions written by hand; times as the server sends them.
  const { FocusView } = await import("@/components/focus/FocusView");
  type FocusData = import("@/lib/focus/types").FocusData;
  type SessionDto = import("@/lib/focus/types").SessionDto;
  const focusNow = "2026-11-17T09:42:00.000Z";
  const finished = (id: string, title: string | null, start: string, end: string, minutes: number, rating: number | null) => ({
    id,
    eventId: null,
    eventTitle: title,
    eventGoalId: null,
    plannedMinutes: 60,
    status: "finished" as const,
    startedAt: start,
    pausedAt: null,
    pausedSeconds: 0,
    endedAt: end,
    rating,
    focusedMinutes: minutes,
  });
  const recent = [
    finished("r1", "Statistics lecture notes", "2026-11-16T14:00:00.000Z", "2026-11-16T15:30:00.000Z", 90, 4),
    finished("r2", null, "2026-11-16T09:00:00.000Z", "2026-11-16T09:55:00.000Z", 45, 3),
    finished("r3", "Group project", "2026-11-14T10:00:00.000Z", "2026-11-14T11:00:00.000Z", 60, 0),
    finished("r4", "Half-marathon plan", "2026-11-13T18:00:00.000Z", "2026-11-13T18:30:00.000Z", 30, null),
  ];
  const running: SessionDto = {
    id: "a1",
    eventId: "e1",
    eventTitle: "Statistics revision",
    eventGoalId: exam.id,
    plannedMinutes: 60,
    status: "running",
    startedAt: "2026-11-17T09:20:00.000Z",
    pausedAt: null,
    pausedSeconds: 0,
    endedAt: null,
    rating: null,
  };
  type BlockerData = import("@/lib/blocker/types").BlockerData;
  const defaults = ["youtube.com", "instagram.com", "tiktok.com", "x.com", "reddit.com", "facebook.com", "news.ycombinator.com"];
  const blockerOff: BlockerData = {
    sites: defaults.map((domain, i) => ({ id: String(i), domain })),
    connected: true,
    blockingOn: false,
    blockingUntil: null,
    timeZone: "Europe/Lisbon",
  };
  const blockerOn: BlockerData = { ...blockerOff, blockingOn: true, blockingUntil: "2026-11-17T10:20:00.000Z" };
  const notConnected: BlockerData = { ...blockerOff, connected: false };
  const focusPage = (data: FocusData, blocker: BlockerData = data.active?.status === "running" ? blockerOn : blockerOff) =>
    renderToStaticMarkup(
      <Announcer>
        <AppShell current="/focus">
          <FocusView data={data} blocker={blocker} />
        </AppShell>
      </Announcer>,
    );
  const focusGoals = goals.map(({ id, title, look }) => ({ id, title, look }));
  const none = { forEventGoalId: null, goals: focusGoals };
  const focusStates: [string, FocusData][] = [
    ["focus-start.html", { active: null, recent, forEvent: null, now: focusNow, ...none }],
    ["focus-start-for-event.html", { active: null, recent, forEvent: { id: "e1", title: "Statistics revision", suggestedMinutes: 120 }, now: focusNow, forEventGoalId: exam.id, goals: focusGoals }],
    ["focus-running.html", { active: running, recent, forEvent: null, now: focusNow, ...none }],
    [
      "focus-paused.html",
      { active: { ...running, status: "paused", pausedAt: "2026-11-17T09:35:00.000Z" }, recent, forEvent: null, now: focusNow, ...none },
    ],
    [
      "focus-rating.html",
      {
        active: null,
        recent: [finished("r0", "Statistics revision", "2026-11-17T08:30:00.000Z", "2026-11-17T09:30:00.000Z", 60, null), ...recent],
        forEvent: null,
        now: focusNow,
        ...none,
      },
    ],
  ];
  for (const [file, data] of focusStates) writeFileSync(join(OUT, file), page("Focus", focusPage(data), styles));
  writeFileSync(join(OUT, "focus-blocker-not-connected.html"), page("Focus", focusPage(focusStates[0][1], notConnected), styles));

  // The extension's block page, as Chrome shows it (its own HTML and CSS, the text its script sets).
  const extensionDir = join(ROOT, "extension");
  const blockedHtml = readFileSync(join(extensionDir, "blocked.html"), "utf8")
    .replace('<link rel="stylesheet" href="blocked.css" />', `<style>${readFileSync(join(extensionDir, "blocked.css"), "utf8")}</style>`)
    .replace('<script type="module" src="blocked.js"></script>', "")
    .replace("This site is blocked while you focus.", "instagram.com is blocked while you focus.")
    .replace('<p id="until" hidden></p>', '<p id="until">Blocking ends at 10:20.</p>')
    .replace('<a id="back" href="#">Open LockedIn</a>', '<a id="back" href="#">Back to LockedIn</a>');
  writeFileSync(join(OUT, "block-page.html"), blockedHtml);
  writeFileSync(join(OUT, "focus-running-phone.html"), phoneFrame("Focus", page("Focus", focusPage(focusStates[2][1]), styles)));

  // The Analytics page in tabs (spec 49). Once from sessions and attempts saved the real way and read
  // with the page's own loader, once per tab from the sample report (a full week with goals), and empty.
  const { AnalyticsTabs } = await import("@/components/analytics/AnalyticsTabs");
  const { loadAnalyticsTabsPage } = await import("@/lib/server/pages/load");
  const { sampleReport } = await import("@/lib/analytics/report-fixture");
  const { STANDARD_LAYOUT, TABS } = await import("@/lib/analytics/report-types");
  const { seedSession } = await import("@test/support/sessions");
  const stats = await createTestApp();
  const learner = await stats.signedInAs("analytics@example.com", { timeZone: "Europe/Lisbon" });
  const done = (start: string, minutes: number, planned: number, paused = 0) =>
    seedSession(stats.db, learner, {
      status: "finished",
      plannedMinutes: planned,
      startedAt: `2026-11-${start}:00Z`,
      pausedSeconds: paused,
      endedAt: new Date(Date.parse(`2026-11-${start}:00Z`) + (minutes * 60 + paused) * 1000).toISOString(),
    });
  const blockedAt = (domain: string, time: string) =>
    stats.db.admin("insert into app.blocked_attempts (user_id, domain, attempted_at) values ($1, $2, $3)", [learner, domain, `2026-11-${time}:00Z`]);
  await done("16T09:00", 45, 60, 600); // A2
  await blockedAt("instagram.com", "16T09:12");
  await blockedAt("youtube.com", "16T09:40");
  await done("16T14:00", 90, 90);
  await done("17T08:30", 60, 60);
  await blockedAt("instagram.com", "17T08:50");
  await done("17T16:00", 25, 30);
  await blockedAt("reddit.com", "17T18:30"); // during an auto-block event, outside a session
  await done("18T10:00", 120, 120);
  await blockedAt("instagram.com", "18T10:40");
  await blockedAt("x.com", "18T11:05");
  await done("19T09:00", 30, 60);
  stats.advance(3 * 24 * 3_600_000 + 4 * 3_600_000); // Thursday 19 November, 13:00 UTC
  const full = (await loadAnalyticsTabsPage(stats.deps, learner)).report;
  const fresh = await stats.signedInAs("new-account@example.com", { timeZone: "Europe/Lisbon" });
  const empty = (await loadAnalyticsTabsPage(stats.deps, fresh)).report;
  await stats.close();
  const analyticsPage = (report: typeof full, tab: (typeof TABS)[number] = "overview") =>
    renderToStaticMarkup(
      <AppShell current="/analytics">
        <AnalyticsTabs report={report} layout={STANDARD_LAYOUT} tab={tab} onEdit={() => {}} onExport={() => {}} />
      </AppShell>,
    );
  const analyticsHtml = page("Analytics", analyticsPage(sampleReport), styles);
  writeFileSync(join(OUT, "analytics.html"), analyticsHtml);
  for (const tab of TABS) writeFileSync(join(OUT, `analytics-${tab}.html`), page("Analytics", analyticsPage(sampleReport, tab), styles));
  writeFileSync(join(OUT, "analytics-from-database.html"), page("Analytics", analyticsPage(full, "focus"), styles));
  writeFileSync(join(OUT, "analytics-empty.html"), page("Analytics", analyticsPage(empty), styles));
  writeFileSync(join(OUT, "analytics-phone.html"), phoneFrame("Analytics", analyticsHtml));

  // Spec 19: the coach. The sample week's goals and its Wednesday (18 November) as the calendar around
  // an open draft; an added draft for Tuesday; the empty page; and the page at phone width.
  const { CoachView } = await import("@/components/coach/CoachView");
  type ChatPageData = import("@/lib/chat/types").ChatPageData;
  type EventDto = import("@/lib/events/types").EventDto;
  const wednesday = week.days[2];
  const wednesdayEvents: EventDto[] = [
    ...wednesday.allDay.map((e) => ({ ...e, startAt: null, endAt: null })),
    ...wednesday.events,
  ];
  const goalId = (title: string) => goals.find((g) => g.title === title)!.id;
  const proposed = (title: string, start: string, end: string, goal: string | null = null) => ({
    title,
    startAt: `2026-11-${start}:00.000Z`,
    endAt: `2026-11-${end}:00.000Z`,
    goalId: goal ? goalId(goal) : null,
  });
  const coachData = (fields: Partial<ChatPageData>): ChatPageData => ({
    display: { timeFormat: "12h", dayStartHour: 7, dayEndHour: 21 },
    timeZone: "Europe/Lisbon",
    // Spec 44: a few chats for the list, the open one first.
    chats: [
      { id: "chat-wed", title: "Tomorrow I want to study about 2 hours in the morning", updatedAt: "2026-11-17T20:00:30.000Z" },
      { id: "chat-gym", title: "Plan the gym into my week", updatedAt: "2026-11-17T09:12:00.000Z" },
      { id: "chat-mon", title: "How much time did I spend on my goals last week?", updatedAt: "2026-11-16T18:40:00.000Z" },
      { id: "chat-fri", title: "Plan my Saturday: a long run in the morning", updatedAt: "2026-11-13T16:05:00.000Z" },
    ],
    chatId: "chat-wed",
    now: "2026-11-17T21:00:00.000Z",
    messages: [],
    draftDayEvents: [],
    draftDays: [],
    goals: goalLabels,
    chatAllowed: true,
    assistantConfigured: true,
    ...fields,
  });
  const chat = (id: string, role: "user" | "assistant", text: string, draft: ChatPageData["messages"][number]["draft"] = null) => ({
    id,
    role,
    text,
    createdAt: "2026-11-17T20:00:00.000Z",
    draft,
  });
  const openDraft = coachData({
    messages: [
      chat("m1", "user", "Tomorrow I want to study about 2 hours in the morning, work on the group project after lunch, go for a short run and watch football with friends in the evening."),
      chat(
        "m2",
        "assistant",
        "Here is a draft for Wednesday. I kept your coffee, the thesis meeting, the tutorial and the half-marathon training where they are.\n\nThe run is short and easy, since you train at 6pm. Football starts at 8pm.",
        {
          id: "d1",
          status: "open",
          events: [
            proposed("Statistics revision", "18T09:00", "18T10:45", "Pass the statistics exam"),
            proposed("Group project", "18T13:00", "18T15:30", "Finish the group project"),
            proposed("Easy run", "18T17:00", "18T17:45", "Run a half marathon"),
            proposed("Football with friends", "18T20:00", "18T22:30"),
          ],
          changes: [],
        },
      ),
    ],
    draftDayEvents: wednesdayEvents,
    draftDays: ["2026-11-18"],
  });
  const addedDraft = coachData({
    messages: [
      chat("m1", "user", "Plane meinen Tag morgen: 4 Stunden lernen, abends Fußball schauen"),
      chat("m2", "assistant", "Hier ist ein Entwurf für Dienstag: zwei Lernblöcke um deine Termine herum (3,5 Stunden, mehr passt nicht), Fußball ab 20 Uhr.", {
        id: "d1",
        status: "accepted",
        events: [
          proposed("Lernen", "17T07:00", "17T09:00", "Pass the statistics exam"),
          proposed("Lernen", "17T11:00", "17T12:30", "Pass the statistics exam"),
          proposed("Fußball schauen", "17T20:00", "17T22:00"),
        ],
        changes: [],
      }),
      chat("m3", "user", "Fits."),
      chat("m4", "assistant", "Added. Have a good evening and good luck with the revision tomorrow."),
    ],
  });
  // Spec 20: a draft that moves one of Wednesday's events and deletes another, and a new event.
  const movable = wednesday.events.filter((e) => e.source !== "outlook" && !e.seriesId);
  const changesDraft = coachData({
    messages: [
      chat("m1", "user", "Move my first block of the day to the afternoon, drop the second one and add a short walk."),
      chat("m2", "assistant", "Done: the first block moves to the afternoon, the second is removed, and a walk fits at 12:30.", {
        id: "d1",
        status: "open",
        events: [proposed("Walk", "18T12:30", "18T13:00")],
        changes: [
          ...(movable[0]
            ? [
                {
                  kind: "move" as const,
                  eventId: movable[0].id,
                  title: movable[0].title,
                  goalId: movable[0].goalId,
                  oldStartAt: movable[0].startAt!,
                  oldEndAt: movable[0].endAt!,
                  startAt: "2026-11-18T15:30:00.000Z",
                  endAt: new Date(Date.parse("2026-11-18T15:30:00.000Z") + Date.parse(movable[0].endAt!) - Date.parse(movable[0].startAt!)).toISOString(),
                },
              ]
            : []),
          ...(movable[1]
            ? [
                {
                  kind: "delete" as const,
                  eventId: movable[1].id,
                  title: movable[1].title,
                  goalId: movable[1].goalId,
                  oldStartAt: movable[1].startAt!,
                  oldEndAt: movable[1].endAt!,
                  startAt: null,
                  endAt: null,
                },
              ]
            : []),
        ],
      }),
    ],
    draftDayEvents: wednesdayEvents,
    draftDays: ["2026-11-18"],
  });
  const coachPage = (data: ChatPageData) =>
    renderToStaticMarkup(
      <Announcer>
        <AppShell current="/coach" display={data.display}>
          <CoachView data={data} />
        </AppShell>
      </Announcer>,
    );
  const coachOpenHtml = page("Coach", coachPage(openDraft), styles);
  writeFileSync(join(OUT, "coach-empty.html"), page("Coach", coachPage(coachData({ chatId: null })), styles));
  writeFileSync(join(OUT, "coach-draft.html"), coachOpenHtml);
  writeFileSync(join(OUT, "coach-added.html"), page("Coach", coachPage(addedDraft), styles));
  writeFileSync(join(OUT, "coach-changes.html"), page("Coach", coachPage(changesDraft), styles));
  writeFileSync(join(OUT, "coach-phone.html"), phoneFrame("Coach", coachOpenHtml));
  writeFileSync(join(OUT, "coach-empty-phone.html"), phoneFrame("Coach", page("Coach", coachPage(coachData({ chatId: null })), styles)));

  writeFileSync(join(OUT, "sign-in.html"), page("Sign in", renderToStaticMarkup(<SignInPage />), styles));
  writeFileSync(join(OUT, "sign-up.html"), page("Sign up", renderToStaticMarkup(<SignUpPage />), styles));

  expect(readdirSync(OUT)).toEqual(expect.arrayContaining(["week-desktop.html", "week-phone.html", "event-editor.html", "goal-editor.html", "demo-week.html", "welcome-1.html", "settings.html", "settings-phone.html", "sign-in.html", "sign-up.html"]));
});
