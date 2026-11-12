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
  const { GoalsPanel } = await import("@/components/goals/GoalsPanel");
  const { GoalEditor } = await import("@/components/goals/GoalEditor");
  const { PanelState } = await import("@/components/shell/PanelState");
  const { loadGoals } = await import("@/lib/server/goals/load");
  const { loadTasks } = await import("@/lib/server/tasks/load");
  const { EventEditor, SeriesQuestion } = await import("@/components/calendar/EventEditor");
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
  await add("Group project", "11-17T14:00", "11-17T19:00", { goalId: project.id });
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
        <PanelState>
          <AppShell current="/" panelsLeft={<GoalsPanel goals={goals} tasks={tasks} today="2026-11-17" />}>
            <CalendarView
              week={shown}
              nowLocal="2026-11-17T12:10"
              suggestion={{ start: "2026-11-17T13:00", end: "2026-11-17T14:00" }}
              goals={goals.map(({ id, title, look }) => ({ id, title, look }))}
              outlookAvailable
            />
          </AppShell>
        </PanelState>
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

  // The editor open on the revision that overlaps the call. A static page cannot open a modal
  // dialog, so the dialog is shown with the `open` attribute and a dimmed layer is drawn behind it.
  const revision = week.days[1].events.find((e) => e.title === "Statistics revision")!;
  const editorMarkup = renderToStaticMarkup(
    <EventEditor
      state={{ mode: "edit", event: revision }}
      goals={goals.map(({ id, title, look }) => ({ id, title, look }))}
      onClose={() => {}}
    />,
  ).replace(
    "<dialog",
    "<dialog open",
  );
  const dim = `.preview-dim{position:fixed;inset:0;background:rgb(16 16 16/.2);z-index:65}
dialog.event-editor[open]{position:fixed;inset:auto 0 0 0;z-index:70;animation:none}
@media (min-width:640px){dialog.event-editor[open]{inset:0 0 auto auto}}`;
  writeFileSync(
    join(OUT, "event-editor.html"),
    page("Event editor", `${calendar()}<div class="preview-dim"></div>${editorMarkup}`, styles, dim),
  );

  // Spec 07: a new event with the repeat controls (weekly; Tuesday is the first date's day).
  const goalLabels = goals.map(({ id, title, look }) => ({ id, title, look }));
  const repeatMarkup = renderToStaticMarkup(
    <EventEditor state={{ mode: "create", start: "2026-11-17T09:00", end: "2026-11-17T10:00", repeat: "weekly" }} goals={goalLabels} onClose={() => {}} />,
  ).replace("<dialog", "<dialog open");
  writeFileSync(join(OUT, "event-editor-repeat.html"), page("Repeat", `${calendar()}<div class="preview-dim"></div>${repeatMarkup}`, styles, dim));

  // Spec 07: an all-day event in the editor.
  const examWeek = week.days[2].allDay.find((e) => e.title === "Exam week")!;
  const allDayMarkup = renderToStaticMarkup(<EventEditor state={{ mode: "edit", event: examWeek }} goals={goalLabels} onClose={() => {}} />).replace(
    "<dialog",
    "<dialog open",
  );
  writeFileSync(join(OUT, "event-editor-all-day.html"), page("All day", `${calendar()}<div class="preview-dim"></div>${allDayMarkup}`, styles, dim));

  // Spec 07: the question after Delete on an event of a series (the footer as it looks then).
  const tutorial = week.days[0].events.find((e) => e.title === "Statistics tutorial")!;
  const footer = '<div class="flex flex-wrap items-center gap-2 border-t';
  const seriesMarkup = renderToStaticMarkup(<EventEditor state={{ mode: "edit", event: tutorial }} goals={goalLabels} onClose={() => {}} />)
    .replace("<dialog", "<dialog open")
    .replace(/(<div class="flex flex-wrap items-center gap-2 border-t[^"]*">).*(<\/div><\/form>)/s, (_m, open: string, close: string) =>
      `${open}${renderToStaticMarkup(<SeriesQuestion kind="delete" title={tutorial.title} busy={false} onAnswer={() => {}} onCancel={() => {}} />)}${close}`,
    );
  if (!seriesMarkup.includes(footer) || !seriesMarkup.includes("This and following events")) throw new Error("series question not placed");
  writeFileSync(join(OUT, "event-editor-series.html"), page("Series", `${calendar()}<div class="preview-dim"></div>${seriesMarkup}`, styles, dim));

  // Spec 08: an Outlook event in the editor, and the Outlook panel in its three states.
  const ethics = week.days[3].events.find((e) => e.title === "Business ethics seminar")!;
  const outlookEditorMarkup = renderToStaticMarkup(<EventEditor state={{ mode: "edit", event: ethics }} goals={goalLabels} onClose={() => {}} />).replace(
    "<dialog",
    "<dialog open",
  );
  writeFileSync(join(OUT, "event-editor-outlook.html"), page("Outlook event", `${calendar()}<div class="preview-dim"></div>${outlookEditorMarkup}`, styles, dim));

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
          <SettingsView data={data} blocker={settingsBlocker} timeZones={Intl.supportedValuesOf("timeZone")} />
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

  // The goals column with tasks at phone width: the same content the phone sheet shows.
  const sheetMarkup = renderToStaticMarkup(
    <Announcer>
      <PanelState>
        <GoalsPanel goals={goals} tasks={tasks} today="2026-11-17" />
      </PanelState>
    </Announcer>,
  ).replace("sticky top-0 hidden h-dvh w-[280px]", "block h-dvh w-full");
  writeFileSync(join(OUT, "goals-tasks-phone.html"), phoneFrame("Goals with tasks", page("Goals with tasks", sheetMarkup, styles)));

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

  // Spec 13: the demo week. A new account chooses "Explore the demo" on Wednesday 18 November at 13:00 in
  // Lisbon; the calendar, the goals column and the Focus page then show what load_demo created.
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
  const demoCalendar = (w: typeof demoWeek, g: typeof demoGoals, t: typeof demoTasks, after = "") =>
    renderToStaticMarkup(
      <Announcer>
        <PanelState>
          <AppShell current="/" panelsLeft={<GoalsPanel goals={g} tasks={t} today="2026-11-18" />}>
            <CalendarView
              week={w}
              nowLocal="2026-11-18T13:00"
              suggestion={{ start: "2026-11-18T14:00", end: "2026-11-18T15:00" }}
              goals={g.map(({ id, title, look }) => ({ id, title, look }))}
              outlookAvailable
            />
          </AppShell>
        </PanelState>
      </Announcer>,
    ) + after;
  const demoHtml = page("Demo week", demoCalendar(demoWeek, demoGoals, demoTasks), styles);
  writeFileSync(join(OUT, "demo-week.html"), demoHtml);
  writeFileSync(join(OUT, "demo-week-phone.html"), phoneFrame("Demo week", demoHtml));

  // The welcome over the new account's empty calendar, in each step. A static page cannot open a
  // modal dialog, so it gets the `open` attribute and a dimmed, blurred layer behind it.
  const welcomeCss = `.preview-dim{position:fixed;inset:0;background:rgb(16 16 16/.3);backdrop-filter:blur(2px);z-index:65}
dialog.welcome[open]{position:fixed;inset:auto 0 0 0;z-index:70;animation:none}
@media (min-width:768px){dialog.welcome[open]{inset:0;margin:auto;height:fit-content}}`;
  for (const step of [1, 2, 3] as const) {
    const welcome = renderToStaticMarkup(<Welcome timeFormat="12h" defaultStep={step} />).replace("<dialog", "<dialog open");
    const html = page("Welcome", demoCalendar(emptyWeek, [], [], `<div class="preview-dim"></div>${welcome}`), styles, welcomeCss);
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
    .replace('<a id="back" href="#">Open Lock In</a>', '<a id="back" href="#">Back to Lock In</a>');
  writeFileSync(join(OUT, "block-page.html"), blockedHtml);
  writeFileSync(join(OUT, "focus-running-phone.html"), phoneFrame("Focus", page("Focus", focusPage(focusStates[2][1]), styles)));

  // The Analytics page (spec 06), from sessions and attempts saved the real way and read with loadAnalytics.
  const { AnalyticsView } = await import("@/components/analytics/AnalyticsView");
  const { loadAnalytics } = await import("@/lib/server/analytics/load");
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
  const full = await loadAnalytics(stats.deps, learner);
  const fresh = await stats.signedInAs("new-account@example.com", { timeZone: "Europe/Lisbon" });
  const empty = await loadAnalytics(stats.deps, fresh);
  await stats.close();
  const analyticsPage = (data: typeof full) =>
    renderToStaticMarkup(
      <AppShell current="/analytics">
        <AnalyticsView data={data} />
      </AppShell>,
    );
  const analyticsHtml = page("Analytics", analyticsPage(full), styles);
  writeFileSync(join(OUT, "analytics.html"), analyticsHtml);
  writeFileSync(join(OUT, "analytics-empty.html"), page("Analytics", analyticsPage(empty), styles));
  writeFileSync(join(OUT, "analytics-phone.html"), phoneFrame("Analytics", analyticsHtml));

  writeFileSync(join(OUT, "sign-in.html"), page("Sign in", renderToStaticMarkup(<SignInPage />), styles));
  writeFileSync(join(OUT, "sign-up.html"), page("Sign up", renderToStaticMarkup(<SignUpPage />), styles));

  expect(readdirSync(OUT)).toEqual(expect.arrayContaining(["week-desktop.html", "week-phone.html", "event-editor.html", "goal-editor.html", "demo-week.html", "welcome-1.html", "settings.html", "settings-phone.html", "sign-in.html", "sign-up.html"]));
});
