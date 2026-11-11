import "server-only";

// The signed-in check that every action outside the account pages starts with (R3).
import { MESSAGES } from "@/lib/messages";
import type { AuthService } from "./auth/types";
import { ActionError } from "./errors";

/** Returns the signed-in user's id, or throws a 401 rejection that `handleAction` turns into an answer. */
export async function requireUser(auth: AuthService): Promise<string> {
  const userId = await auth.currentUserId();
  if (!userId) throw new ActionError(401, "unauthorized", MESSAGES.signInRequired);
  return userId;
}
