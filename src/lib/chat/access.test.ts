// R21 and R5 (spec 19): who may use the coach, both ways of the CHAT_PRO_ONLY switch.
import { describe, expect, it } from "vitest";
import { chatAllowed } from "./access";

describe("chatAllowed", () => {
  it("lets every signed-in user in while Pro only is off (the default until Free and Pro are built)", () => {
    expect(chatAllowed("free", false)).toBe(true);
    expect(chatAllowed("pro", false)).toBe(true);
  });

  it("lets only Pro users in once Pro only is on (R21, A4)", () => {
    expect(chatAllowed("pro", true)).toBe(true);
    expect(chatAllowed("free", true)).toBe(false);
  });
});
