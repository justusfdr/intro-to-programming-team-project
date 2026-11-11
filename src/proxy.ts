// Runs before every page and data request: refreshes the session cookie and sends signed-out
// visitors to the sign-in page (pages) or answers 401 (data requests). See src/lib/route-guard.ts.
import { NextResponse, type NextRequest } from "next/server";
import { MESSAGES } from "@/lib/messages";
import { guard } from "@/lib/route-guard";
import { refreshSession } from "@/lib/server/auth/supabase";
import { supabaseConfigured } from "@/lib/server/config";

export async function proxy(request: NextRequest) {
  // Without a Supabase project (local work before setup) everyone counts as signed out.
  const { response, userId } = supabaseConfigured()
    ? await refreshSession(request)
    : { response: NextResponse.next({ request }), userId: null };

  const decision = guard(request.nextUrl.pathname, userId !== null);
  if (decision.kind === "allow") return response;

  const answer =
    decision.kind === "unauthorized"
      ? NextResponse.json(
          { error: "unauthorized", message: MESSAGES.signInRequired },
          { status: 401, headers: { "Cache-Control": "no-store" } },
        )
      : NextResponse.redirect(new URL(decision.to, request.url));
  // Keep cookie changes from the refresh (for example a cleared, expired session).
  for (const cookie of response.cookies.getAll()) answer.cookies.set(cookie);
  return answer;
}

export const config = {
  // Everything except Next.js's own files and the icon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
