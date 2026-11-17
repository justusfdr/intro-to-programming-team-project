# Spec 48: Focus page with studies, and the research on the landing page
Asked for by the owner on 17 Nov 2026, after the team looked at six drawings and chose the second layout. Branch `48-focus-studies`, from `main` (first written as spec 47; the sidebar widgets took that number on `main` the same evening). It brings the Focus library (spec 29, branch `focus-library`, never merged) onto `main` and builds on it. `docs/ontology.md` is unchanged; what it would need is proposed below and waits for the team. No migration, no new dependency, no new service.

## Why
The Focus page was a timer and a list of old sessions: nothing on it said why a session is worth it. The library's articles do, with studies anyone can open. The team wants them where the work starts, as tiles of different sizes with small drawings, and in front of visitors on the landing page.

## What
**Focus page**
- [x] Before a session, two cards side by side on wide screens (one under the other on phones): on the left the start card, now with a ring that shows the chosen length; on the right "Before you start".
- [x] "Before you start": three steps to tick, each with one sentence from a study, the study's authors, year and kind, and a link to its article: silence the phone (Stothart, Mitchum, Yehnert, 2015), write down the first step (Gollwitzer, Sheeran, 2006), banners off (Altmann, Trafton, Hambrick, 2014). The sentences use only numbers the articles have.
- [x] The second step has a text field for the first step. What is typed stays in this browser tab only (`sessionStorage`), is shown under the timer while the session runs, and is removed when the session ends or is cancelled. Nothing of the list is sent to the server or saved in the account; the ticks are gone after a reload.
- [x] "Recent sessions" is no longer a section at the foot of the page. A small button under the start card opens the same list in place; it says how many sessions there are.
- [x] "From the library": seven articles as tiles of four sizes (one large with a drawing, one tall, one wide, four square) with "All articles". Each tile shows what its article has: its number, bars, steps or two or three numbers, all taken from the article itself. The first three are the three of the day from spec 29; all seven move on by one each day in the user's time zone.
- [x] While a session is running or paused the page shows the session only: no list, no tiles.
- [x] Four drawings, one per shelf: a line of work that dips into two other tasks and comes back (interruptions), a phone face down that buzzes (phones and feeds), a dot stopped by a bump (what helps), steps (guides). They draw themselves once.

**Landing page**
- [x] A fourth entry in the bar, "The research", jumps to a new section between "How it works" and "Why we built it".
- [x] The section: what the library is, three popular claims with a verdict ("Half true", "Not confirmed", "Not shown"), and the nine articles as tiles in the same four sizes.
- [x] A tile or a claim opens its article in a reading window on the page: header, text, bars that grow, steps, numbers, what the study cannot show, the studies with a link to each publication, two more articles to read, and "Start for free". Escape, the close button or a click beside it closes it.
- [x] The articles are part of the page; no new address is opened to visitors. `src/lib/route-guard.ts` is unchanged, `/focus/library` still needs a sign-in, and the guides (they explain screens a visitor cannot open) are not shown.
- [x] Without JavaScript the section reads the same; only the reading window needs it.

**Both**
- [x] Motion (bars grow, lines draw, a dot arrives) runs once and only for readers who have not asked for less motion.
- [x] No existing test is changed. The Focus page still says "From the library", links the day's three articles and "All articles", and holds the list of recent sessions in its markup.

## Proposed change to the ontology (not made; waits for the team's approval)
In addition to what spec 29 proposes:
- Fixed content, added to the list: "the three steps of 'Before you start' on the Focus page".
- Never saved, as a sentence under the Focus rules: "The ticks of 'Before you start' and the first step typed there stay in the browser and are never sent to the server."
- In the library rule spec 29 proposes, the sentence "The pages need sign-in like every page (R3)" gets a second half: "the landing page shows the same articles to visitors, without the guides".

## Out of scope
Saving the list or the first step in the account, or writing the first step into an event's to-dos (both would need an action in the ontology). An address of its own for each article on the landing page (the landing page's test allows links to four addresses only; changing it is the team's decision). A "Library" entry in the sidebar. Photos or clips made with Higgsfield. German texts. A drawing for each single article (there is one per shelf).

Still open: the owner looks at it in a browser signed in (the Focus page was checked with sample data, without an account); the team's approval of the ontology change; each "Publication" link clicked once.

## Done when
All existing tests pass unchanged. New: `src/lib/library/tiles.test.ts`, `src/components/library/Bento.test.tsx`, `src/components/focus/FocusStudies.test.tsx`, `src/components/landing/Research.test.tsx`. `npm run check` passes. Looked at in a browser at desktop and phone width.
