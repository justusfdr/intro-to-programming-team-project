// The Goals page's "New goal" (spec 42): it opens the guided questions; there is no form for a new goal.
// A static render cannot click, so the page is opened the way the button leaves it (the `openOn` prop is
// for tests and previews only).
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GoalsPage } from "./GoalsPage";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));

const render = (openOn?: "setup") =>
  renderToStaticMarkup(<GoalsPage goals={[]} tasks={[]} today="2026-11-17" places={[{ id: "p1", name: "Gym", address: "FitnessHut Lisboa" }]} openOn={openOn} />);

describe("New goal on the Goals page", () => {
  it("has both dialogs on the page, empty while closed", () => {
    const html = render();
    expect(html).toContain('<dialog aria-labelledby="goal-setup-name"');
    expect(html).toContain('<dialog aria-labelledby="goal-editor-title"');
    expect(html).not.toContain("What is this goal about?");
    expect(html).not.toContain(">Create</button>");
  });

  it("opens the questions, without a way to a form, and not the editor", () => {
    const html = render("setup");
    expect(html).toContain("What is this goal about?");
    expect(html).not.toContain("Use the form instead");
    expect(html).not.toContain(">Create</button>");
  });
});
