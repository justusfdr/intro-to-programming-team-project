// R21 and R5: who may use the coach. One decision, on the server: with CHAT_PRO_ONLY switched on only
// Pro users, otherwise every signed-in user (Free and Pro are not built yet).
export type Plan = "free" | "pro";

export function chatAllowed(plan: Plan, proOnly: boolean): boolean {
  return !proOnly || plan === "pro";
}
