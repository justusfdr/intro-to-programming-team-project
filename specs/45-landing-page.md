# Spec 45: Landing page
Branch `landing-page`, from `main`. No change to the database or to the ontology. No change to R3: the calendar at `/` and every other page of the app still send a signed-out visitor to the sign-in page.

## Why
A visitor who opens the app sees a sign-in form and nothing that says what the app is. Before the presentation we want one page that tells the story: the day is full of distractions, and this calendar plans the week around your goals, blocks time for deep work and keeps distractions out.

## What
- [x] A page at `/home`, open to everyone, with no sign-in and no data: plain text and drawings with made-up events. "Log in" leads to `/sign-in`, "Start for free" to `/sign-up`.
- [x] A bar at the top that stays while scrolling: the name, "How it works", "Pricing", "FAQ", "Log in", "Start for free".
- [x] First screen: the claim, two buttons and the week view, where the coach's suggestions appear dashed and lock in as real blocks.
- [x] "How it works": the idea in one sentence (with the day's distractions struck through), then three steps, each with words on the left and a moving picture of the real screen on the right (on phones the picture follows the words): Plan (a chat with the coach, a draft, "Add to calendar"), Focus (a running session, blocked sites arriving), Reach (two goals, this week's count going up).
- [x] "Why we built it": a quote of one of the founders.
- [x] "Works with the tools you already use": Outlook Calendar, Claude, Chrome, Google Maps. Every tool on it is built. (Until 20 Nov the list had Google Calendar marked "Coming soon"; the team took it off and added Claude, which powers the coach.)
- [x] "Pricing": Free and Pro from `src/lib/billing/plans.ts`, the same list the pricing page inside the app uses.
- [x] "FAQ": seven questions; opening one closes the one that was open.
- [x] A last invitation and a foot with three lists: Product, Company, Legal.
- [x] A page at `/legal`, open to everyone: privacy, terms and cookies in plain words. A draft for the team to read; each sentence describes what the code does today.
- [x] The look is the app's own: the same font, colours, cards, round buttons and goal colours. The pictures are drawn with the app's classes and components (`LogoMark`, `GoalTile`, `goalColor`, `buttonClass`).
- [x] Moves: plain CSS in `src/app/home/landing.css`, only transform and opacity (the focus ring also its stroke). A picture starts when it scrolls into view (`Scene.tsx`). With "reduce motion" nothing moves and every picture shows its final state. Without JavaScript the page reads the same.
- [x] `src/lib/route-guard.ts` lets exactly `/home` and `/legal` through for signed-out visitors (`VISITOR_PAGES`), nothing below or beside them.

## Open for the team
- A signed-out visitor of `/` still lands on the sign-in page, as R3 and its tests say. Sending them to `/home` instead would change R3's wording and two existing tests, so it is left for the team to decide.
- The quote, the wording of the legal notes, and whether Google Calendar gets built.

## Out of scope
Changing `/` for visitors; a cookie banner (there are no cookies to ask about); translations; real photos or video; a contact form.

## Done when
`src/components/landing/Landing.test.tsx`: one title, the links in the bar, the three steps in order with words before picture, a description of each picture for screen readers, the plans equal to `PLANS`, "Coming soon" only on Google Calendar, every question with its answer, the three lists at the foot, and every link on both pages leads to an address that exists. `src/lib/route-guard-visitor-pages.test.ts` and `src/proxy-visitor-pages.test.ts`: `/home` and `/legal` open without a sign-in, nothing below or beside them does, and the app's own pages and data are as closed as before. The existing guard and proxy tests are unchanged. `npm run check` passes. Looked at in a browser at desktop and phone width.
