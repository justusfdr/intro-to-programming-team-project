// The markup of "Position your photo" (spec 31, "Positioning the photo"): a native dialog named by its
// heading, the square frame (about 280 px) with the picture at the middle-square start and the round mask,
// a frame that takes the keyboard, the 64 px round preview, the zoom slider from 1 to 4 times with minus
// and plus, the hint to choose a saved photo again, an error shown inside the dialog, Cancel and Use photo.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FRAME, PhotoDialog } from "./PhotoDialog";

const LANDSCAPE = { url: "blob:http://localhost/photo-1", width: 400, height: 300 };
const noop = () => {};
// React adds a preload hint for the picture before the dialog; only the dialog matters here.
const render = (props: Partial<Parameters<typeof PhotoDialog>[0]> = {}) =>
  renderToStaticMarkup(<PhotoDialog picture={LANDSCAPE} busy={false} error={null} onCancel={noop} onUse={noop} {...props} />).replace(/^<link [^>]*\/>/, "");

describe("Position your photo", () => {
  it("is a dialog named by its heading, with Cancel and Use photo", () => {
    const html = render();
    expect(html).toMatch(/^<dialog[^>]*aria-labelledby="photo-dialog-title"/);
    expect(html).toContain('<h2 id="photo-dialog-title"');
    expect(html).toContain(">Position your photo</h2>");
    expect(html).toContain(">Cancel</button>");
    expect(html).toContain(">Use photo</button>");
  });

  it("the frame: square, focusable, described by the hint, the picture placed at the middle square, the round mask", () => {
    const html = render();
    expect(FRAME).toBe(280);
    expect(html).toMatch(/data-photo-frame="true" role="group" tabindex="0" aria-label="Photo position" aria-describedby="[^"]+-hint"/);
    expect(html).toContain("width:280px;height:280px");
    expect(html).toContain("touch-none");
    // 400 x 300 fits the frame at 373.33 x 280, centred: 46.67 px cut on each side.
    expect(html).toMatch(/src="blob:http:\/\/localhost\/photo-1" alt="" draggable="false" style="left:-46.66\d*px;top:0;width:373.33\d*px;height:280px"/);
    expect(html).toContain("rounded-full shadow-[0_0_0_9999px");
    expect(html).toContain("arrow keys");
  });

  it("the 64 px round preview shows the same picture, smaller", () => {
    const html = render();
    expect(html).toMatch(/data-photo-preview="true" style="width:64px;height:64px" class="[^"]*rounded-full/);
    expect(html.match(/src="blob:http:\/\/localhost\/photo-1"/g)).toHaveLength(2);
    expect(html).toContain(">Preview</span>");
  });

  it("zoom: a slider from fits the frame to 4 times with minus and plus; minus is off at the start", () => {
    const html = render();
    expect(html).toMatch(/<input type="range" aria-label="Zoom" aria-valuetext="1.0 times" min="1" max="4" step="0.05"[^>]*value="1"/);
    expect(html).toMatch(/aria-label="Zoom out" disabled=""/);
    expect(html).toMatch(/aria-label="Zoom in"(?! disabled)/);
  });

  it("says to choose a saved photo again to move it; shows an error inside; waits while saving", () => {
    const html = render({ busy: true, error: "A photo can be at most 200 KB" });
    expect(html).toContain("Choose the photo again to move it");
    expect(html).toContain("A photo can be at most 200 KB");
    expect(html).toContain(">Saving…</button>");
    expect(html).toMatch(/<input type="range"[^>]*disabled=""/);
  });

  it("closed: an empty dialog", () => {
    const html = render({ picture: null });
    expect(html).toMatch(/^<dialog[^>]*><\/dialog>$/);
  });
});
