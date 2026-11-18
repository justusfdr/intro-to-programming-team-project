"use client";

// Holds the CSS animations inside it until it scrolls into view, then lets them run once (spec 45).
// The animations themselves are plain CSS (src/app/home/landing.css). Without JavaScript they simply
// run when the page loads; with "reduce motion" there are none, and this component does nothing.
import { useEffect, useRef, type ReactNode } from "react";

export function Scene({
  children,
  className = "",
  /**
   * How far up the screen the top of the element must have come before it starts, in percent of the
   * screen's height from the bottom. Measured from the top edge, so it works for an element of any height.
   */
  inset = 18,
}: {
  children: ReactNode;
  className?: string;
  inset?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined" || typeof el.getAnimations !== "function") return;

    // Back to the first frame and wait there. Every animation fills backwards, so nothing flashes.
    const held = el.getAnimations({ subtree: true });
    for (const animation of held) {
      animation.pause();
      animation.currentTime = 0;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        for (const animation of held) animation.play();
        observer.disconnect();
      },
      { rootMargin: `0px 0px -${inset}% 0px`, threshold: 0 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      // Leaving the page half way: never keep a graphic frozen at its first frame.
      for (const animation of held) if (animation.playState === "paused") animation.play();
    };
  }, [inset]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
