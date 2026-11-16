// The Goals page's "New goal" (spec 42): it opens the guided questions, whose first question offers
// "Use the form instead", which opens the goal editor for a new goal. A static render cannot click, so
// the page is opened the way each button leaves it (the `openOn` prop is for tests and previews only).
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GoalsPage } from "./GoalsPage";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));

const render = (openOn?: "setup" | "form") =>
  renderToStaticMarkup(<GoalsPage goals={[]} tasks={[]} today="2026-11-17" places={[{ id: "p1", name: "Gym", address: "FitnessHut Lisboa" }]} openOn={openOn} />);

describe("New goal on the Goals page", () => {
  it("has both dialogs on the page, empty while closed", () => {
    const html = render();
    expect(html).toContain('<dialog aria-labelledby="goal-setup-name"');
    expect(html).toContain('<dialog aria-labelledby="goal-editor-title"');
    expect(html).not.toContain("What is this goal about?");
    expect(html).not.toContain(">Create</button>");
  });

  it("opens the questions, with 'Use the form instead' on the first one, and not the form", () => {
    const html = render("setup");
    expect(html).toContain("What is this goal about?");
    expect(html).toContain(">Use the form instead</button>");
    expect(html).not.toContain(">Create</button>");
  });

  it("the form for a new goal is the goal editor, with its Routine section open", () => {
    const html = render("form");
    expect(html).not.toContain("What is this goal about?");
    expect(html).toContain('id="goal-editor-title"');
    expect(html).toContain(">Create</button>");
    expect(html).toMatch(/aria-expanded="true"[^>]*>.*Routine/);
    expect(html).toContain(">Gym</button>");
  });
});
