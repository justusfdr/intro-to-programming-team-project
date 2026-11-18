// The library's articles (spec 29). Written by hand from the studies in ./studies.ts: every number
// is the paper's own, and every article says what its study cannot show. English only.
import type { Article } from "./types";

export const ARTICLES: Article[] = [
  {
    slug: "where-the-23-minutes-come-from",
    topic: "interruptions",
    title: "Where the 23 minutes come from",
    dek: "The most quoted number about interruptions is real. It just does not mean what the posters say.",
    figure: { value: "25:26", label: "minutes until interrupted work was picked up again" },
    studies: ["mark-2005", "iqbal-2007"],
    body: [
      {
        kind: "p",
        text: "You have seen the line: it takes 23 minutes and 15 seconds to refocus after an interruption. It is on slides, in newsletters and on the wall of at least one open-plan office. Almost nobody who quotes it has read where it comes from.",
      },
      { kind: "h", text: "What was measured" },
      {
        kind: "p",
        text: "In 2005 Gloria Mark and two colleagues followed 24 office workers at one company with a stopwatch, three days each, more than 700 hours in total. They logged every change of task to the second. People stayed with one piece of work for 11 minutes and 4 seconds on average before they switched or were interrupted, and 57 percent of those stretches ended in an interruption.",
      },
      {
        kind: "p",
        text: "About three quarters of the interrupted work was picked up again the same day. When it was, that happened 25 minutes and 26 seconds later on average. In between, people had worked on about two other things.",
      },
      {
        kind: "steps",
        title: "One interruption, as the stopwatch saw it",
        steps: [
          { label: "You work on the report", detail: "11 minutes on average" },
          { label: "Something cuts in", detail: "A colleague, a call, your own idea" },
          { label: "Two other things", detail: "You deal with about two other tasks first" },
          { label: "Back on the report", detail: "25 min 26 s later, if it is still today" },
        ],
      },
      { kind: "h", text: "So where is 23:15?" },
      {
        kind: "p",
        text: "Not in the paper. Mark gave that figure in a 2006 interview about a larger group of workers, and it measures the same thing: the time on the clock until someone came back to the task. It is not the time your brain needs to warm up again. Nobody held a stopwatch to that.",
      },
      {
        kind: "p",
        text: "A second team reached a similar size by another road. Shamsi Iqbal and Eric Horvitz logged the computers of 27 Microsoft employees for two weeks. After an email or chat alert pulled someone away, they spent close to 10 minutes on the detour and another 10 to 15 minutes before they were back in the window they had left. In 27 percent of cases that window stayed untouched for more than two hours.",
      },
      {
        kind: "stats",
        stats: [
          { value: "57 %", label: "of work stretches ended in an interruption" },
          { value: "~2", label: "other tasks before people came back" },
          { value: "27 %", label: "of alert detours lasted over two hours" },
        ],
      },
      {
        kind: "limits",
        text: "Both studies watched office workers at a single company in the mid-2000s, before smartphones were common. The spread is huge: some tasks were back within a minute, some never came back that day. Read 25 minutes as “an interruption costs far more than its own length”, not as a law of nature.",
      },
      {
        kind: "try",
        text: "The detour is the expensive part, so make the detour hard. Start a session, let the blocker hold the usual suspects, and when something pops into your head, write it down instead of following it.",
      },
    ],
  },
  {
    slug: "faster-and-more-stressed",
    topic: "interruptions",
    title: "Interrupted people work faster. That is the bad news.",
    dek: "In a lab study, constant interruptions slowed nobody down. They changed what the work felt like.",
    figure: { value: "20 min", label: "of interrupted work were enough to raise stress" },
    studies: ["mark-2008"],
    body: [
      {
        kind: "p",
        text: "Here is a result that does not fit the usual story. In 2008 Gloria Mark, Daniela Gudith and Ulrich Klocke asked 48 people, most of them students in Germany, to play an HR manager and answer a batch of emails. Some worked in peace. The others were interrupted by phone or chat about every two minutes.",
      },
      {
        kind: "p",
        text: "The interrupted groups finished sooner. Leaving out the time the interruptions themselves took, they needed between 20 and 21 minutes for emails that took the undisturbed group almost 23. They made the same number of mistakes. Their emails were just as polite.",
      },
      {
        kind: "bars",
        title: "Time to finish the emails",
        note: "Minutes, without the time spent on the interruptions.",
        bars: [
          { label: "No interruptions", value: 22.77, text: "22.8 min" },
          { label: "Interrupted, same topic", value: 20.31, text: "20.3 min", strong: true },
          { label: "Interrupted, other topic", value: 20.6, text: "20.6 min", strong: true },
        ],
      },
      { kind: "h", text: "The price showed up somewhere else" },
      {
        kind: "p",
        text: "Afterwards everyone rated how the task had felt, on scales from 1 to 20. Stress went from 6.9 to above 9. Frustration, time pressure and effort rose as well. People had made up the lost time by speeding up and writing slightly shorter emails, and they paid for it in strain.",
      },
      {
        kind: "bars",
        title: "Stress reported after the task",
        note: "Own rating on a scale from 1 to 20.",
        bars: [
          { label: "No interruptions", value: 6.92, text: "6.9" },
          { label: "Interrupted, same topic", value: 9.46, text: "9.5", strong: true },
          { label: "Interrupted, other topic", value: 9.13, text: "9.1", strong: true },
        ],
      },
      {
        kind: "p",
        text: "It made no difference whether the interruption had anything to do with the task. A question on the same subject cost as much as an unrelated one.",
      },
      {
        kind: "limits",
        text: "One short lab session with a made-up job, and stress was each person’s own rating. The authors say themselves that a slowdown right after each interruption may exist and be hidden by the faster pace that follows.",
      },
      {
        kind: "try",
        text: "Twenty minutes were enough to move the numbers. You can keep up your speed through a day full of pings; the question is what that day costs you. A session with nothing coming in gets you the same output for less.",
      },
    ],
  },
  {
    slug: "the-task-you-left-is-still-open",
    topic: "interruptions",
    title: "The task you left is still open",
    dek: "Switching tasks takes a second. Getting your head to follow takes longer, and unfinished work makes it worse.",
    figure: { value: "55 vs 45", label: "score on the next task: first one finished vs left open" },
    studies: ["leroy-2009", "leroy-glomb-2018"],
    body: [
      {
        kind: "p",
        text: "You close the spreadsheet and open the essay. On the screen the switch is complete. In your head, part of you is still in column F.",
      },
      {
        kind: "p",
        text: "Sophie Leroy gave this leftover a name in 2009: attention residue. In her first experiment 84 students worked on a word puzzle and were then moved to a second task. Those who had to leave the puzzle unfinished were quicker to recognise words connected to it. It was still active in their minds while they were supposed to be doing something else.",
      },
      {
        kind: "p",
        text: "The second experiment, with 78 students, looked at what that does to the work that follows. Everyone reviewed job applications and was then tested on what they remembered. People who had finished the first task scored 55 on average. People who had been pulled off it scored 45.",
      },
      {
        kind: "bars",
        title: "Score on the second task",
        note: "Average recall score in the 2009 experiment.",
        bars: [
          { label: "First task finished", value: 55.3, text: "55.3" },
          { label: "First task left unfinished", value: 44.71, text: "44.7", strong: true },
        ],
      },
      { kind: "h", text: "Finishing is not always enough" },
      {
        kind: "p",
        text: "There was a twist. People who finished the first task with time to spare still carried some of it along. It took finishing under time pressure to let go of it cleanly. A hard stop seems to close a task better than a soft one.",
      },
      { kind: "h", text: "A note to your later self" },
      {
        kind: "p",
        text: "You cannot finish everything before the next thing starts. In 2018 Leroy and Theresa Glomb tested a small fix across four studies: before you turn to whatever interrupts you, take a moment to note where you are and what you will do first when you come back. They call it a ready-to-resume plan. With the plan there was less residue, and people did better work on the thing that had interrupted them.",
      },
      {
        kind: "limits",
        text: "The 2009 experiments used students, puzzles and a memory test, in sessions of under an hour. They show that residue exists and that it hurts the next task. They do not say how many minutes it lasts.",
      },
      {
        kind: "try",
        text: "Before a session ends or something pulls you out, write one line: where you stopped, what comes next. The notes of an event or its to-dos are a good place for it.",
      },
    ],
  },
  {
    slug: "2-8-seconds",
    topic: "interruptions",
    title: "2.8 seconds",
    dek: "How short can an interruption be and still knock you off course? Shorter than it takes to read this sentence.",
    figure: { value: "×2", label: "errors after an interruption of 2.8 seconds" },
    studies: ["altmann-2014"],
    body: [
      {
        kind: "p",
        text: "Erik Altmann and his colleagues built a task that works like any procedure with steps: you have to remember where you are. Participants worked through a fixed sequence on a computer. Every so often the screen cut in and asked them to type a few characters. Then they carried on.",
      },
      {
        kind: "p",
        text: "When the interruption lasted 4.4 seconds on average, people were three times as likely to carry on at the wrong step: 5.8 percent of the time instead of 1.8. In a second experiment the researchers cut it to 2.8 seconds, about as long as one step of the task took. The error rate still doubled, from 2.0 to 4.3 percent.",
      },
      {
        kind: "bars",
        title: "Carrying on at the wrong step",
        note: "Share of steps right after an interruption, against steps with none.",
        bars: [
          { label: "Experiment 1: no interruption", value: 1.8, text: "1.8 %" },
          { label: "Experiment 1: after 4.4 seconds", value: 5.8, text: "5.8 %", strong: true },
          { label: "Experiment 2: no interruption", value: 2.0, text: "2.0 %" },
          { label: "Experiment 2: after 2.8 seconds", value: 4.3, text: "4.3 %", strong: true },
        ],
      },
      { kind: "h", text: "They did not notice" },
      {
        kind: "p",
        text: "The interesting part is what stayed the same. People barely hesitated when they came back. They carried on at close to full speed, confident, in the wrong place. Other kinds of mistakes did not increase. The interruption had not made them sloppy. It had wiped the bookmark.",
      },
      {
        kind: "p",
        text: "A glance at a banner is about that long. It is over before you decide anything, and the cost arrives one step later, looking like your own carelessness.",
      },
      {
        kind: "limits",
        text: "A lab task with letters and digits, and the error rates are small in absolute terms. “Three seconds double your mistakes at everything” is not what the study shows. It shows that even a tiny break can make you lose your place.",
      },
      {
        kind: "try",
        text: "Work that has an order to it, like a proof, a calculation or a piece of code, is the kind this hits. For that work, switch the banners off for the length of the session, not only the sound.",
      },
    ],
  },
  {
    slug: "the-phone-on-your-desk",
    topic: "phones",
    title: "The phone on your desk",
    dek: "One famous study says its mere presence drains your brain. The follow-ups are less sure. The buzz is another matter.",
    figure: { value: "33 studies", label: "on a silent phone nearby: together, almost no effect" },
    studies: ["ward-2017", "hartanto-2024", "stothart-2015"],
    body: [
      {
        kind: "p",
        text: "In 2017 a study with a great title, “Brain Drain”, reported that students did worse on memory and reasoning tests when their own phone lay on the desk than when it was in another room. Silent, untouched. Switching it off did not help. The finding travelled fast, because it felt true.",
      },
      {
        kind: "p",
        text: "The effect was small even in the original, and it has not held up well. A 2024 analysis pooled 33 studies with 4,368 participants and found an overall effect of almost exactly zero. Its authors see little reason, for now, to believe that keeping the phone out of sight improves your work by itself.",
      },
      {
        kind: "stats",
        stats: [
          { value: "520", label: "students in the first 2017 experiment" },
          { value: "33", label: "studies pooled in 2024" },
          { value: "−0.02", label: "overall effect, no different from zero" },
        ],
      },
      { kind: "h", text: "A phone that speaks up" },
      {
        kind: "p",
        text: "A phone that does something is a different case. In 2015 Cary Stothart and two colleagues had people work through a dull attention task while their own phones received calls or texts. Nobody answered: anyone who looked at or touched the phone was left out of the analysis. Performance dropped all the same, by about as much as other studies find for people who are actually using their phone.",
      },
      {
        kind: "p",
        text: "You do not have to pick it up. Knowing that something arrived is enough to pull part of your attention to it.",
      },
      {
        kind: "limits",
        text: "The notification study is one short lab task, and its evidence is clearer for calls than for texts. The research on phones lying nearby consists mostly of small studies. What is left standing: a quiet phone is probably fine, a phone that buzzes is not.",
      },
      {
        kind: "try",
        text: "You do not need to lock the phone in another room. Silence it properly for the session: no sound, no vibration, screen down.",
      },
    ],
  },
  {
    slug: "what-happens-when-people-log-off",
    topic: "phones",
    title: "What happens when people log off",
    dek: "Tens of thousands of people were paid to leave Facebook and Instagram for weeks. They felt better. A little.",
    figure: { value: "60 min", label: "a day came back when people left Facebook for a month" },
    studies: ["allcott-2020", "allcott-2026"],
    body: [
      {
        kind: "p",
        text: "The cleanest way to find out what a feed does to you is to take it away from some people at random and compare them with the rest. Economists have now done this on a scale that psychology rarely manages.",
      },
      {
        kind: "p",
        text: "In 2018 Hunt Allcott and colleagues paid American Facebook users to deactivate their accounts for four weeks; the analysis covers 1,661 people. Those who left got back 60 minutes a day on average. They spent much of it offline, watching television and seeing friends and family. They knew less about the news and were less politically polarised. And they reported being slightly happier and less anxious: 0.09 standard deviations on an index of well-being.",
      },
      { kind: "h", text: "How much is 0.09?" },
      {
        kind: "p",
        text: "Not much. The authors put it at 25 to 40 percent of what psychological interventions achieve. It is real and it can be measured, and you might not notice it on a given Tuesday.",
      },
      {
        kind: "p",
        text: "In 2020 the experiment was repeated with Meta’s cooperation, with 19,857 Facebook users and 15,585 Instagram users, for the six weeks before the US election. Leaving Facebook improved people’s reported emotional state by 0.06 standard deviations. For Instagram the figure was 0.04, and it did not clear the bar the researchers had set themselves in advance. The one group that stood out was women aged 18 to 24, at 0.11, in an analysis that had not been planned beforehand.",
      },
      {
        kind: "bars",
        title: "Feeling better after logging off",
        note: "Improvement in standard deviations. The 2018 and 2020 studies used different questionnaires.",
        bars: [
          { label: "Facebook, 4 weeks (2018)", value: 0.09, text: "0.09", strong: true },
          { label: "Facebook, 6 weeks (2020)", value: 0.06, text: "0.06", strong: true },
          { label: "Instagram, 6 weeks (2020)", value: 0.041, text: "0.04" },
        ],
      },
      { kind: "h", text: "The hour is the story" },
      {
        kind: "p",
        text: "If you came for proof that Instagram wrecks your mood, the best experiments do not hand it to you. What they show reliably is the hour. People who stepped away had sixty more minutes every day, and many kept their use lower afterwards: weeks after the first study ended, they were using the Facebook app about a fifth less than the comparison group.",
      },
      {
        kind: "limits",
        text: "Everyone in these studies agreed to quit for money, mood was each person’s own report, and both ran in the weeks before an American election. They measure a few weeks without one platform, not a life without social media.",
      },
      {
        kind: "try",
        text: "An hour a day is seven hours a week. That is a goal’s worth of time. Decide what it is for before you free it up, or something else will take it.",
      },
    ],
  },
  {
    slug: "short-videos-and-attention",
    topic: "phones",
    title: "Short videos and attention",
    dek: "Seventy-one studies point the same way. None of them can tell you which way the arrow goes.",
    figure: { value: "71 studies", label: "tie heavy short-video use to weaker attention" },
    studies: ["nguyen-2025"],
    body: [
      {
        kind: "p",
        text: "Short video is the newest format and the one people worry about most, so it pays to be exact about what is known. In 2025 a review in Psychological Bulletin pooled 71 studies with 98,299 participants, covering TikTok, Reels, Shorts and their relatives.",
      },
      {
        kind: "p",
        text: "People who used short video more did worse on measures of thinking. The link was strongest for attention and for inhibitory control, which is the ability to stop yourself from doing the automatic thing. It held for teenagers and adults, and across platforms. Heavier use also went with more stress and anxiety. It was not tied to body image or self-esteem.",
      },
      {
        kind: "bars",
        title: "How strongly each is tied to short-video use",
        note: "Size of the correlation, from 0 (no link) to 1. All point the unwelcome way: more short video, less control and attention, more stress and anxiety.",
        bars: [
          { label: "Inhibitory control", value: 0.41, text: "0.41", strong: true },
          { label: "Attention", value: 0.38, text: "0.38", strong: true },
          { label: "Stress", value: 0.34, text: "0.34" },
          { label: "Anxiety", value: 0.33, text: "0.33" },
        ],
      },
      { kind: "h", text: "Which way does it run?" },
      {
        kind: "p",
        text: "Here is the catch. Nearly all of these studies are snapshots: they ask how much someone watches and measure their attention at the same moment. A snapshot cannot tell you whether the feed wears attention down, or whether people who find it hard to concentrate are the ones who end up in the feed. Both are plausible. Probably both happen.",
      },
      {
        kind: "p",
        text: "So “TikTok destroys your attention span” is not something anyone has shown. “The people who scroll most are the ones who find it hardest to focus” is what the data say.",
      },
      {
        kind: "p",
        text: "For a single evening you do not need the arrow. You know what the format is: clips too short to get bored in, and no last one. Nothing in it will ever ask you to stop.",
      },
      {
        kind: "limits",
        text: "Correlations only, and many of the studies rely on people’s own guess of how much they watch. There is no long randomized experiment on short video and attention yet.",
      },
      {
        kind: "try",
        text: "A feed has no end, so bring your own. Put the sites on your block list and let a session, or a goal with auto-block, draw the line for you.",
      },
    ],
  },
  {
    slug: "a-small-speed-bump",
    topic: "helps",
    title: "A small speed bump",
    dek: "Most scrolling starts before any decision is made. A pause of a few seconds is often enough to turn it into one.",
    figure: { value: "36 %", label: "of attempts to open an app were dropped after a short pause" },
    studies: ["gruning-2023", "allcott-2022"],
    body: [
      {
        kind: "p",
        text: "Think of the last time you opened Instagram. Chances are you did not decide to. Your thumb knew the way.",
      },
      {
        kind: "p",
        text: "A 2023 study in PNAS tested what happens when something small is put in that path. The app one sec makes you wait a few seconds before a chosen app opens and then asks whether you still want it. Researchers followed 280 of its users for six weeks. In 36 percent of attempts, people closed the app again once the pause was over. They also tried less often: attempts to open the chosen apps fell by 37 percent between the first week and the sixth.",
      },
      {
        kind: "stats",
        stats: [
          { value: "36 %", label: "of attempts ended with the app closed again" },
          { value: "−37 %", label: "attempts to open it, week 1 to week 6" },
          { value: "−57 %", label: "actual openings after six weeks" },
        ],
      },
      {
        kind: "p",
        text: "A second experiment with 500 people took the pieces apart. The delay helped. Being able to say “no, not now” helped most. A message asking people to think it over did nothing.",
      },
      { kind: "h", text: "Limits you set yourself" },
      {
        kind: "p",
        text: "Economists found the same pattern with more people. In a randomized experiment with 1,933 Android users, one group could set daily limits for apps such as Facebook, Instagram and YouTube, with a delay before a limit could be pushed back. They used those apps 22 minutes a day less than the comparison group, a drop of 16 percent, and 78 percent were still using their limits when the study ended. From what people chose for their future selves, the authors estimate that problems of self-control account for 31 percent of social media use.",
      },
      { kind: "h", text: "Why so little is enough" },
      {
        kind: "p",
        text: "None of this is a lock. Everyone in both studies could get to the app if they wanted to. What the pause does is turn a reflex into a question, and asked directly, people often answer no.",
      },
      {
        kind: "limits",
        text: "One of the authors of the PNAS study built the app it tests, its users had installed it by choice, and many dropped out along the way. The study of limits is independent and randomized. It measures screen time, not concentration.",
      },
      {
        kind: "try",
        text: "The blocker here works the same way. During a session a blocked site shows a page instead of the feed. You can always end the session. You just have to mean it.",
      },
    ],
  },
  {
    slug: "decide-before-the-moment",
    topic: "helps",
    title: "Decide before the moment arrives",
    dek: "Wanting to focus tomorrow morning is a wish. “At nine I open the draft” is a plan, and plans of that shape work.",
    figure: { value: "94 tests", label: "of if-then plans: people followed through clearly more often" },
    studies: ["gollwitzer-2006"],
    body: [
      {
        kind: "p",
        text: "Most intentions fail at the same spot. Not because you stop wanting the thing, but because the moment to act arrives looking like any other moment, and you are busy.",
      },
      {
        kind: "p",
        text: "The psychologist Peter Gollwitzer has spent decades on a simple remedy he calls implementation intentions. Instead of “I will work on my thesis this week” you settle it in advance: when X happens, I will do Y. Tuesday at nine, at the desk, the draft opens. The decision is made once, ahead of time, so the moment itself does not need one.",
      },
      {
        kind: "p",
        text: "In 2006 he and Paschal Sheeran pooled 94 independent tests of the idea. People who had made an if-then plan were clearly more likely to reach their goal than people who only held the intention. The effect size was 0.65, which counts as medium to large. The plans helped with getting started, and with staying on course when something tried to pull people off it.",
      },
      {
        kind: "stats",
        stats: [
          { value: "94", label: "independent tests pooled" },
          { value: "0.65", label: "effect size, medium to large" },
        ],
      },
      { kind: "h", text: "A calendar is a stack of if-then plans" },
      {
        kind: "p",
        text: "A block in your calendar is an if-then plan with the blanks filled in: when, where, what. You can write the other half too. “If I catch myself reaching for the phone, I write the thought down and carry on.” “If the session ends and I am mid-sentence, I finish the sentence and stop.”",
      },
      {
        kind: "p",
        text: "One honest gap: we found no trial that tests blocking time in a calendar as such. The case for it rests on this wider research, and on the fact that the alternative, deciding afresh every hour what to do next, is exactly the situation in which intentions tend to lose.",
      },
      {
        kind: "limits",
        text: "The analysis is from 2006 and covers goals of every kind, not phone use in particular. One of its two authors is the researcher who proposed the idea, and studies that find nothing are less likely to be published in the first place.",
      },
      {
        kind: "try",
        text: "Put the session in your calendar with a start time and one concrete first step in its to-dos. When the time comes, open the event and start the session from there.",
      },
    ],
  },
  {
    slug: "set-up-a-session",
    topic: "guides",
    title: "Set up a session in a minute",
    dek: "Pick a length, press start, and let the app keep the time.",
    studies: [],
    body: [
      {
        kind: "steps",
        title: "From nothing to a running session",
        steps: [
          { label: "Choose a length", detail: "15, 30, 60, 90 or 120 minutes on the Focus page, or any other length under Custom" },
          { label: "Press Start focus", detail: "The ring shows the time that is left" },
          { label: "Pause if you must", detail: "Blocking stops while you are paused and comes back when you resume" },
          { label: "Let it run out", detail: "The session ends by itself at the planned length, also with the browser closed" },
        ],
      },
      {
        kind: "p",
        text: "You can start a session for something you have planned: open the event in the calendar and choose Start focus. The session then belongs to that event, and the app suggests a length that fits it.",
      },
      {
        kind: "p",
        text: "Afterwards the app asks how it went. The rating is optional, from 0 to 5. A session that you cancel, or that lasts under a minute, is not saved at all.",
      },
      {
        kind: "try",
        text: "Ending early lowers that session’s focus score, so choose a length you believe in. Thirty honest minutes beat two hours you bail out of.",
      },
    ],
  },
  {
    slug: "make-the-blocker-yours",
    topic: "guides",
    title: "Make the blocker yours",
    dek: "The block list starts with six sites. Ten minutes of setup make it fit the way you actually get lost.",
    studies: [],
    body: [
      {
        kind: "steps",
        title: "Three things to set up once",
        steps: [
          { label: "Install the extension", detail: "Settings has the download and the steps for Chrome" },
          { label: "Edit your list", detail: "Add the sites you really drift to, up to 50, and remove the ones you need for work" },
          { label: "Switch on auto-block for a goal", detail: "Its events then block the list by themselves, with no session needed" },
        ],
      },
      {
        kind: "p",
        text: "A new account blocks youtube.com, instagram.com, tiktok.com, x.com, reddit.com and facebook.com. Blocking is on while a session is running, and during the events of a goal that has auto-block switched on. Tabs that are already open on a blocked site are sent to the block page too.",
      },
      {
        kind: "p",
        text: "Each time you try to open a blocked site during a session, the attempt is counted and takes five points off that session’s focus score. Analytics shows which sites you ran into most.",
      },
      {
        kind: "limits",
        text: "The blocker covers pages you load in Chrome on this computer. It does not reach the apps on your phone or other programs, and it can start up to a minute late. It is a help, not a lock: you can end a session or edit the list at any time.",
      },
    ],
  },
];
