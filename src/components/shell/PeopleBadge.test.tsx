// Spec 54, changed 19 Nov 2026 after the owner tried it with two accounts: ONE number, on "People": the
// open contact invitations plus the event invitations not answered yet ("one contact request and one
// event invitation: a 2 in a circle"). "Calendar" has no number any more (the calendar's toolbar button
// "N invitations" stays).
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";
import { PeopleLink } from "./Sidebar";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const render = (invitations: number, pendingInvites: number) =>
  renderToStaticMarkup(
    <AppShell current="/" invitations={invitations} pendingInvites={pendingInvites}>
      page
    </AppShell>,
  );
const peopleLink = (html: string) => html.match(/<a href="\/people"[^>]*>.*?<\/a>/)?.[0] ?? "";
const calendarLink = (html: string) => html.slice(html.indexOf('aria-label="Main navigation"')).match(/<a href="\/"[^>]*>.*?<\/a>/)?.[0] ?? "";

describe("the one number on People (spec 54, changed 19 Nov 2026)", () => {
  it("0 + 0: no badge and no extra name", () => {
    const link = peopleLink(render(0, 0));
    expect(link).toMatch(/^<a href="\/people" class="[^"]*">/);
    expect(link).not.toContain('aria-hidden="true" class');
  });

  it("1 contact invitation + 0 event invitations: 1", () => {
    const link = peopleLink(render(1, 0));
    expect(link).toContain('aria-label="People, 1 open invitation"');
    expect(link).toMatch(/>1<\/span><\/a>$/);
  });

  it("0 contact invitations + 2 event invitations: 2", () => {
    const link = peopleLink(render(0, 2));
    expect(link).toContain('aria-label="People, 2 open invitations"');
    expect(link).toMatch(/>2<\/span><\/a>$/);
  });

  it("1 + 1: a 2 in a circle", () => {
    const link = peopleLink(render(1, 1));
    expect(link).toContain('aria-label="People, 2 open invitations"');
    expect(link).toMatch(/<span aria-hidden="true" class="[^"]*rounded-full[^"]*">2<\/span><\/a>$/);
  });

  it("collapsed sidebar: the dot, and the number in the name and title", () => {
    const link = renderToStaticMarkup(<PeopleLink on={false} wide={false} invitations={1} pendingInvites={1} />);
    expect(link).toContain('aria-label="People, 2 open invitations"');
    expect(link).toContain('title="People, 2 open invitations"');
    expect(link).toMatch(/<span aria-hidden="true" class="absolute right-1 top-1 size-2 rounded-full bg-today"><\/span><\/a>$/);
    expect(renderToStaticMarkup(<PeopleLink on={false} wide={false} invitations={0} pendingInvites={0} />)).not.toContain("bg-today");
  });

  it("Calendar has no number, whatever the event invitations", () => {
    for (const html of [render(0, 3), render(2, 5)]) {
      const link = calendarLink(html);
      expect(link).toMatch(/^<a href="\/" aria-current="page" class="[^"]*">/);
      expect(link).not.toContain("invitation");
      expect(link).not.toContain("<span");
    }
  });
});
