// "Before you start" on the Focus page (spec 48): three things to do before a session, each with
// one sentence from a study of the library. Fixed content. Every number here is in the article
// the step links to; the test checks that the study belongs to that article.
import type { Claim, StartStep } from "./types";

export const START_STEPS: readonly StartStep[] = [
  {
    id: "phone",
    title: "Silence your phone: no sound, no vibration",
    text: "A call or text you never answer still pulls attention away. A silent phone nearby is probably fine.",
    study: "stothart-2015",
    slug: "the-phone-on-your-desk",
  },
  {
    id: "first-step",
    title: "Write down your first step",
    text: "People who had decided when and what in advance followed through clearly more often, across 94 tests.",
    study: "gollwitzer-2006",
    slug: "decide-before-the-moment",
    field: { label: "Your first step", placeholder: "Open the draft and write the first paragraph" },
  },
  {
    id: "banners",
    title: "Switch banners off, not only the sound",
    text: "An interruption of 2.8 seconds doubled the errors on a task with steps, from 2.0 to 4.3 percent.",
    study: "altmann-2014",
    slug: "2-8-seconds",
  },
];

/** Three claims most people have heard, and what the library's studies leave of them. */
export const CLAIMS: readonly Claim[] = [
  { quote: "It takes 23 minutes to refocus.", verdict: "Half true", slug: "where-the-23-minutes-come-from" },
  { quote: "A phone on the desk drains your brain.", verdict: "Not confirmed", slug: "the-phone-on-your-desk" },
  { quote: "Short videos destroy your attention span.", verdict: "Not shown", slug: "short-videos-and-attention" },
];
