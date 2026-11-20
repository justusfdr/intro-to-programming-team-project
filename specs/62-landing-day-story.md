# Spec 62: The landing page tells one day
Branch `62-landing-day-story`, from `main`. No change to the database, to the ontology or to the route guard. Builds on spec 45 (landing page).

## Why
"How it works" showed three separate steps, each with a picture that plays once. The team wanted the page to feel alive while scrolling and to tell the whole story in one go: you set a goal, the coach plans it into your day, you focus, you get to the next place on time, your goal moves, and the numbers are there at the end, as a PDF if you want.

## What
- [x] Under the sentence of "How it works" the page shows one day, Thursday 19 November, in six stops: Goal (8:00), Plan (8:30), Focus (9:00), On the way (11:00), Reach (2:00), Look back (5:00).
- [x] Plan, Focus and Reach are the three steps of spec 45 with the same words, the same links and the same pictures. Goal, On the way and Look back are new.
- [x] On a wide and tall enough screen (from 1024 by 600) the stage stays in place while scrolling. On its left stands the day from 8 AM to 6 PM with a red line for "now" and a clock. Scrolling moves the line through the day; each stop comes in from the side when the line reaches its time, with its words on the left and its picture on the right.
- [x] The day fills up as the story goes: the thesis block and the run are not there at first, appear dashed when the coach suggests them and become real events when the draft is added. The block the line is in stands out.
- [x] Goal: the six questions of a new goal answered one after the other, then the goal they make.
- [x] On the way: the event with its place, a small map and a car that drives the way as you scroll; "Leave in 5 min", then "On the way", then "Arrived".
- [x] Look back: the Analytics page, its Export window (period and parts), and the PDF that comes out.
- [x] On phones, on small windows, with "reduce motion" and without JavaScript nothing is pinned: the six stops stand one under the other, words first, then the picture, as the three steps did before. A picture starts when it scrolls into view; with "reduce motion" it shows its final state.
- [x] Tabbing into a stop that is not on screen scrolls the story to it, so every link can be reached with the keyboard.
- [x] Every sentence describes what the app does today: the six questions (spec 42), the coach planning around a goal and around travel time, the four ways to travel, the "Time to leave" widget, the six Analytics tabs and the PDF export (spec 49).

## Where the code is
- `src/lib/landing/story.ts`: which stop is on screen and what time it is for a scroll position. Pure numbers, tested.
- `src/components/landing/content.ts`: the six stops and their words (`STORY`). The three steps (`STEPS`) are unchanged.
- `src/components/landing/DayStory.tsx`: the day on the left and the six stops. `StoryScroll.tsx` is the only part that runs in the browser: it reads the scroll position and starts each stop's picture.
- `src/components/landing/mocks/GoalSetupMock.tsx`, `TravelMock.tsx`, `ReportMock.tsx`: the three new pictures.
- `src/app/home/landing.css`: the pinned layout and the moves. The pinned layout lives there and not in the markup's classes, because it depends on one long screen condition.

## Not changed on purpose
- `Landing.test.tsx` asks for exactly four pictures with a description for screen readers. The three new pictures are therefore marked as decoration and what they show stands in the words next to them. Giving them their own descriptions would mean changing that test, which is for the team to decide.
- The coach picture now says "today" instead of "tomorrow", so it fits the day of the story.

## Out of scope
Changing the first screen, the research, the pricing or the foot; sound; a video; a different story on phones.

## Done when
`src/lib/landing/story.test.ts`: every stop gets the same share of the scroll, the time only moves forward, exactly one stop is visible, and the ends are safe. `src/components/landing/DayStory.test.tsx`: six stops in the order of the day, each with its time, words before picture, the three steps inside with their links, no new link target, the new pictures hidden from screen readers. `Landing.test.tsx` and `Research.test.tsx` pass unchanged. `npm run check` passes. Looked at in a browser: pinned on a laptop, stacked on a phone and with "reduce motion".
