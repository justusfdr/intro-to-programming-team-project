"use client";

// The moving part of the day story (spec 62), and the only part of it that runs in the browser.
// On a large screen the stage is pinned (landing.css) and this reads the scroll position: it moves
// the red line and the clock, shows the stop whose time has come, fills the day with the planned
// events, drives the car, and starts each stop's own animations when the stop comes in.
// Everywhere else the stops stand one under the other and a picture simply starts when it scrolls
// into view, as Scene.tsx does for the rest of the page. With "reduce motion" nothing moves.
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { clockText, ease, storyFrame } from "@/lib/landing/story";
import { STORY, STORY_DAY } from "./content";

/**
 * When the stage is pinned. The same condition stands in landing.css. "scripting" is part of it so a
 * browser that does not know the word stays on the stacked page there and here alike.
 */
const PINNED = "(min-width: 1024px) and (min-height: 600px) and (prefers-reduced-motion: no-preference) and (scripting: enabled)";

/** The share of the "On the way" stop the drive takes: the car sets off once the stop is in and arrives before it leaves. */
const DRIVE_FROM = 0.17;
const DRIVE_TO = 0.86;
/** How long the drive takes where the scroll does not move the car, in milliseconds. */
const DRIVE_TIME = 3200;

/** A picture is drawn this wide and scaled down when its box is smaller, with this much air around it. */
const PICTURE_WIDTH = 440;
const PICTURE_AIR = 32;

/** Stops every animation inside at its first frame. Each one fills backwards, so nothing flashes. */
function hold(element: Element): Animation[] {
  if (typeof element.getAnimations !== "function") return [];
  const held = element.getAnimations({ subtree: true });
  for (const animation of held) {
    animation.pause();
    animation.currentTime = 0;
  }
  return held;
}

/** Never leave a picture frozen at its first frame. */
function release(held: Animation[]) {
  for (const animation of held) if (animation.playState === "paused") animation.play();
}

/** Puts the car where it is after this share of the stop, and tells the picture's labels (landing.css, --u). */
function placeCar(picture: HTMLElement, share: number) {
  const u = Math.min(1, Math.max(0, share));
  picture.style.setProperty("--u", u.toFixed(3));
  const road = picture.querySelector<SVGPathElement>("[data-story-road]");
  const driven = picture.querySelector<SVGPathElement>("[data-story-driven]");
  const car = picture.querySelector<SVGGElement>("[data-story-car]");
  if (!road || !car || typeof road.getTotalLength !== "function") return;

  const length = road.getTotalLength();
  const here = length * ease((u - DRIVE_FROM) / (DRIVE_TO - DRIVE_FROM));
  const point = road.getPointAtLength(here);
  const before = road.getPointAtLength(Math.max(0, here - 1));
  const after = road.getPointAtLength(Math.min(length, here + 1));
  const heading = (Math.atan2(after.y - before.y, after.x - before.x) * 180) / Math.PI;
  car.setAttribute("transform", `translate(${point.x.toFixed(1)} ${point.y.toFixed(1)}) rotate(${heading.toFixed(1)})`);
  if (driven) {
    driven.style.strokeDasharray = `${length}`;
    driven.style.strokeDashoffset = `${length - here}`;
  }
}

/** Back to the picture as it is drawn: the car has arrived. */
function parkCar(picture: HTMLElement) {
  picture.style.removeProperty("--u");
  const car = picture.querySelector<SVGGElement>("[data-story-car]");
  if (car?.dataset.parked) car.setAttribute("transform", car.dataset.parked);
  const driven = picture.querySelector<SVGPathElement>("[data-story-driven]");
  driven?.style.removeProperty("stroke-dasharray");
  driven?.style.removeProperty("stroke-dashoffset");
}

/** The stops one under the other: each part starts once, when it scrolls into view. */
function stacked(root: HTMLElement): () => void {
  if (typeof IntersectionObserver === "undefined") return () => {};
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const undo: (() => void)[] = [];

  for (const part of root.querySelectorAll<HTMLElement>("[data-story-part]")) {
    const held = hold(part);
    const drive = still ? null : part.querySelector<HTMLElement>("[data-story-drive]");
    if (drive) placeCar(drive, 0);
    let frame = 0;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        for (const animation of held) animation.play();
        if (drive) {
          const began = performance.now();
          const step = (now: number) => {
            const share = Math.min(1, (now - began) / DRIVE_TIME);
            placeCar(drive, share);
            if (share < 1) frame = requestAnimationFrame(step);
          };
          frame = requestAnimationFrame(step);
        }
        observer.disconnect();
      },
      { rootMargin: `0px 0px -${part.dataset.inset ?? "18"}% 0px`, threshold: 0 },
    );
    observer.observe(part);

    undo.push(() => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      release(held);
      if (drive) parkCar(drive);
    });
  }
  return () => undo.forEach((step) => step());
}

/** The pinned stage: the scroll position decides everything. */
function pinned(root: HTMLElement): () => void {
  const stage = root.querySelector<HTMLElement>("[data-story-stage]");
  const stops = [...root.querySelectorAll<HTMLElement>("[data-story-stop]")];
  if (!stage || stops.length !== STORY.length) return () => {};

  const held = stops.map(hold);
  const clock = root.querySelector<HTMLElement>("[data-story-clock]");
  const blocks = [...root.querySelectorAll<HTMLElement>("[data-story-block]")];
  const fits = [...root.querySelectorAll<HTMLElement>("[data-story-fit]")];
  const drive = root.querySelector<HTMLElement>("[data-story-drive]");
  const driveStop = drive ? stops.findIndex((stop) => stop.contains(drive)) : -1;
  const stretches = STORY.map(({ from, to }) => ({ from, to }));

  let current = -1;
  let frame = 0;
  /** Where the stage sticks, below the bar at the top. */
  let stuckAt = 0;

  /** How far the stage has to travel, and so how long the story scrolls. */
  const travel = () => root.getBoundingClientRect().height - stage.offsetHeight;

  const measure = () => {
    stuckAt = parseFloat(getComputedStyle(stage).top) || 0;
    for (const fit of fits) {
      const box = fit.parentElement;
      if (!box) continue;
      const scale = Math.min(1, (box.clientWidth - PICTURE_AIR) / PICTURE_WIDTH, (box.clientHeight - PICTURE_AIR) / Math.max(1, fit.offsetHeight));
      fit.style.setProperty("--fit", Math.max(0.4, scale).toFixed(3));
    }
  };

  const update = () => {
    frame = 0;
    const range = travel();
    const progress = range > 0 ? (stuckAt - root.getBoundingClientRect().top) / range : 0;
    const now = storyFrame(progress, stretches);

    root.style.setProperty("--day", ((now.minutes - STORY_DAY.from) / (STORY_DAY.to - STORY_DAY.from)).toFixed(4));
    if (clock) {
      const text = clockText(now.minutes);
      if (clock.textContent !== text) clock.textContent = text;
    }

    stops.forEach((stop, at) => {
      const on = now.presence[at] ?? 0;
      stop.style.setProperty("--on", on.toFixed(3));
      stop.toggleAttribute("data-on", on > 0.001);
    });

    for (const block of blocks) {
      const { from, to, suggested, added } = block.dataset;
      if (added !== undefined) {
        block.dataset.state = now.minutes >= Number(added) ? "real" : suggested !== undefined && now.minutes >= Number(suggested) ? "ghost" : "none";
      }
      block.toggleAttribute("data-current", now.minutes >= Number(from) && now.minutes < Number(to));
    }

    if (drive) placeCar(drive, now.index === driveStop ? now.local : now.index > driveStop ? 1 : 0);

    // A stop that comes in plays its own animations from the start; the one that left goes back to its first frame.
    if (now.index !== current) {
      if (current >= 0) {
        for (const animation of held[current]) {
          animation.pause();
          animation.currentTime = 0;
        }
      }
      for (const animation of held[now.index]) animation.play();
      current = now.index;
    }
  };

  const request = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  const resize = () => {
    measure();
    request();
  };
  /** Tabbing into a stop that is not on screen scrolls the story to it. */
  const focus = (event: FocusEvent) => {
    const target = event.target instanceof Node ? event.target : null;
    const at = stops.findIndex((stop) => target !== null && stop.contains(target));
    if (at < 0 || at === current) return;
    const top = window.scrollY + root.getBoundingClientRect().top - stuckAt + (travel() * (at + 0.5)) / stops.length;
    window.scrollTo({ top });
  };

  root.setAttribute("data-run", "");
  measure();
  update();
  window.addEventListener("scroll", request, { passive: true });
  window.addEventListener("resize", resize);
  root.addEventListener("focusin", focus);
  // The pictures are measured again once the font is there, because it changes their height.
  let alive = true;
  void document.fonts?.ready.then(() => {
    if (alive) resize();
  });

  return () => {
    alive = false;
    window.removeEventListener("scroll", request);
    window.removeEventListener("resize", resize);
    root.removeEventListener("focusin", focus);
    cancelAnimationFrame(frame);
    root.removeAttribute("data-run");
    root.style.removeProperty("--day");
    if (clock) clock.textContent = clockText(STORY_DAY.from);
    for (const stop of stops) {
      stop.style.removeProperty("--on");
      stop.removeAttribute("data-on");
    }
    for (const block of blocks) {
      delete block.dataset.state;
      block.removeAttribute("data-current");
    }
    for (const fit of fits) fit.style.removeProperty("--fit");
    if (drive) parkCar(drive);
    held.forEach(release);
  };
}

export function StoryScroll({ className = "", children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const query = window.matchMedia(PINNED);
    let stop = query.matches ? pinned(root) : stacked(root);
    const change = () => {
      stop();
      stop = query.matches ? pinned(root) : stacked(root);
    };
    query.addEventListener("change", change);
    return () => {
      query.removeEventListener("change", change);
      stop();
    };
  }, []);

  return (
    <div ref={ref} className={className} style={{ "--stops": STORY.length } as CSSProperties}>
      {children}
    </div>
  );
}
