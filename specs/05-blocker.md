# Spec 05: Blocker
Build step 3, part 2 of 2. Plan: `docs/ontology.md`. Branch: `05-blocker`. Needs spec 04 and the decision on the blocker design note.

## Why
While a user focuses, Chrome stops distracting websites. The app decides when; the extension only follows.

## What
- [ ] A new account starts with youtube.com, instagram.com, tiktok.com, x.com, reddit.com and facebook.com; existing accounts get them once.
- [ ] `add_blocked_site` "https://www.Instagram.com/reels" saves "instagram.com" (R17).
- [ ] Rejected, nothing saved: "not a site" ("This is not a valid website", A10); a listed domain ("Already on your list"); a 51st site ("You can block at most 50 sites").
- [ ] `remove_blocked_site` removes the site; its past attempts stay.
- [ ] R15: blocking is on during a `running` session (not `paused`) and during a timed event of a goal with `auto_block` on (start ≤ now < end); `blocking_until` is the latest of these ends. A pure function with tests.
- [ ] A3: auto-block goal, event 09:00 to 11:00, no session; the extension asks at 10:15 and gets blocking on until 11:00; instagram.com opened: attempt (instagram.com, 10:15) saved; at 11:00 blocking is off.
- [ ] The extension's state request returns only the block list, `blocking_on` and `blocking_until`; only to our extension with a valid sign-in; any other origin gets 403 and no data; signed out gets 401 (R16).
- [ ] `record_attempt` saves only domains on the user's list, with the time of the attempt.
- [ ] Every state request sets `extension_seen_at`; after 2 minutes without one the app shows "Blocker not connected: nothing is being blocked" (R18).
- [ ] The extension redirects page loads of listed domains while blocking is on; open tabs on them go to the block page without counting as attempts; the block page shows until when.
- [ ] App unreachable: the extension keeps the last answer until `blocking_until`, then stops; attempts are sent later. Signed out or refused: nothing is blocked (R16).
- [ ] The extension's logic has tests; its README explains loading, permissions and limits (R18).

## Out of scope
Focus score and analytics (step 4), all-day events (step 5), other browsers, phones.

## Done when
All tests pass; output in the pull request. Deployed; the extension loaded in Chrome blocks a listed site during a session there. Reviewed by another member.
