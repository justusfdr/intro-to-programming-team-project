# Spec 29: Focus library
Asked for by the owner on 15 Nov 2026. Branch `claude/gracious-gauss-7h9an2`, from `main`; it reached `main` with spec 47 (branch `47-focus-studies`), which builds on it. Plan: `docs/ontology.md` is unchanged on this branch; the change it needs is proposed below and waits for the team (R3 applies as it is). No migration, no new dependency, no new service.

## Why
The Focus page starts a timer and says nothing about why it is worth it. People believe what they can check: short articles that say what studies on interruptions, phones and feeds found, with the studies listed underneath, and guides that explain sessions and the blocker. The owner showed the "Tipps" tab of another app as the direction: tiles, articles, a list of publications. Ours looks like the calendar, not like a game.

## What
- [x] Fixed content in `src/lib/library`: 9 articles and 2 guides on four shelves (Interruptions, Phones and feeds, What helps, Guides), in English, and 15 studies (authors, year, title, where published, kind, link). Every number in an article is its study's own; every article with a study has one "What this cannot tell you" and ends in "Try it".
- [x] Where a popular number has no source, the article says so (the "23 minutes" come from an interview, the paper says 25 min 26 s and measures something else; the phone on the desk; "TikTok destroys attention").
- [x] `/focus/library`: the shelves as a row of links (`?topic=phones`; reload and back work; anything else shows all), then every article as a tile: its number on the shelf's tint, shelf, title, a line about it, "3 min read · 2 studies". The first tile is the large one.
- [x] `/focus/library/<slug>`: header, text, pictures (bars from zero with every value written out, numbered steps, two or three numbers on tiles), the limits, "Try it" with "Start a session", "Studies and publications" (each with "Publication", opening in a new tab; "Peer-reviewed" only where it is), "Read next" with two other articles. An address that names no article is "not found".
- [x] The reading time is calculated from the words, 200 a minute, rounded up, at least one.
- [x] Focus page: "From the library" with three articles and "All articles", to the right of the start card on wide screens and under it on phones. They move on by one each day in the user's time zone. Not shown while a session is running or paused. (Spec 47, 17 Nov 2026: the three became seven tiles under the start card; the day's three are the first of them.)
- [x] Signed-out visitors are sent to the sign-in page, as on every page (R3). The pages read nothing from the database and save nothing.
- [x] Motion (bars grow, steps arrive, the tiles' drawings move once) only for readers who have not asked for less motion.

## Proposed change to the ontology (not made; waits for the team's approval)
- Fixed content, added to the list: "the Focus library: its articles and guides and the studies they rest on".
- Calculated, never saved, added to the list: "the library's reading times and the three articles on the Focus page".
- A new rule, numbered after the last one on `main` at the time of the merge (spec 28 takes R42 to R46, so R47): "The library is fixed content, in English, the same for every user: short articles on attention and distraction, and guides to the app, on four shelves. An article rests on one or more of at most 15 studies; each is listed under it with authors, year, title, where it was published, how it got its result and a link to the publication. Every number in an article comes from one of its studies, and every article says what its study cannot show. The reading time is calculated from the words (200 a minute, rounded up). Reading only: nothing about what a user reads is saved, and nothing is sent to another service. The pages need sign-in like every page (R3). The Focus page shows three articles, moving on by one each day in the user's time zone, and none while a session is running or paused."

## Out of scope
Pictures and short clips made with Higgsfield for the tiles and headers (planned; the tiles carry a number and a small drawing until then); German texts; marking an article as read, favourites, search; the coach quoting the library; a "Library" entry in the sidebar; articles written or changed in the app.

Still open: the team's approval of the ontology change above; the owner looks at it in a browser; each "Publication" link clicked once (the studies were read at the publishers' pages on 15 Nov 2026, the links were not opened from this machine).

## Done when
All existing tests pass unchanged. New: `src/lib/library/library.test.ts`, `src/components/library/Library.test.tsx`, `src/components/focus/FocusLibrary.test.tsx`, `src/lib/route-guard-library.test.ts`. `npm run check` passes.
