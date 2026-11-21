// Issue #194: a refusal from the server shows next to the buttons, in the footer that always stays in
// view, not at the end of the scrolling sections where nobody sees it.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Card, Refusal } from "./EventEditor";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));

const MESSAGE = "You can mark an event done once it has started";
const refused = { ok: false as const, status: 409, message: MESSAGE };

describe("issue #194: the refusal sits in the footer", () => {
  it("shows the message inside the sticky footer, above the buttons", () => {
    const html = renderToStaticMarkup(
      <Card sections={<p>Notes</p>} notice={<Refusal result={refused} onReload={() => {}} />} footer={<button>Mark done</button>} />,
    );
    const footer = html.slice(html.indexOf("sticky bottom-0"));
    expect(footer).toContain(MESSAGE);
    expect(footer.indexOf(MESSAGE)).toBeLessThan(footer.indexOf("Mark done"));
    expect(html.indexOf("Notes")).toBeLessThan(html.indexOf("sticky bottom-0"));
  });

  it("shows the footer for a refusal even when there are no buttons", () => {
    const html = renderToStaticMarkup(<Card sections={<p>x</p>} notice={<Refusal result={refused} onReload={() => {}} />} footer={null} />);
    expect(html).toContain("sticky bottom-0");
    expect(html).toContain(MESSAGE);
  });

  it("without a refusal and without buttons there is no footer", () => {
    expect(renderToStaticMarkup(<Card sections={<p>x</p>} notice={null} footer={null} />)).not.toContain("sticky bottom-0");
  });

  it("'Changed on another device' still offers Reload", () => {
    const html = renderToStaticMarkup(<Refusal result={{ ok: false, status: 409, message: "Changed on another device. Reload" }} onReload={() => {}} />);
    expect(html).toContain("Reload</button>");
  });
});
