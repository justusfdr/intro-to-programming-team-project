// The four drawings of the library (spec 48), one per shelf: a line of work that dips into two
// other tasks and comes back (interruptions), a phone face down that buzzes (phones and feeds),
// a dot stopped by a bump (what helps), and steps (guides). Decoration only: what they show is
// said in the words next to them. They draw themselves once (globals.css), unless the reader
// asked for less motion; then they simply stand there finished.
import type { CSSProperties } from "react";
import type { Topic } from "@/lib/library/types";

/** When a part of a drawing starts, in milliseconds. */
const at = (ms: number) => ({ "--d": ms }) as CSSProperties;

const line = { fill: "none", strokeWidth: 7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const word = "fill-ink-2 text-[13px] font-medium";

function Interruptions({ labels }: { labels: boolean }) {
  return (
    <>
      <path {...line} className="stroke-ink" d="M30 76 H150" />
      <path {...line} className="library-draw stroke-indigo-300" pathLength={100} style={at(250)} d="M150 76 C178 76 172 130 200 130 H262 C290 130 284 76 312 76" />
      <circle className="library-pop fill-indigo-500" style={at(650)} cx="218" cy="130" r="8" />
      <circle className="library-pop fill-indigo-500" style={at(800)} cx="246" cy="130" r="8" />
      <path {...line} className="library-draw stroke-ink" pathLength={100} style={at(1150)} d="M312 76 H392" />
      {labels && (
        <>
          <text x="30" y="52" className={word}>
            Your task
          </text>
          <text x="184" y="164" className="fill-indigo-600 text-[13px] font-medium">
            Two other tasks
          </text>
          <text x="312" y="52" className={word}>
            Back on it
          </text>
        </>
      )}
    </>
  );
}

function Phones() {
  return (
    <>
      {/* A notebook with three lines, a pen, and the phone face down beside them. */}
      <rect x="84" y="48" width="118" height="92" rx="8" className="fill-surface stroke-ink" strokeWidth="2.5" />
      <path className="stroke-rose-300" fill="none" strokeWidth="4" strokeLinecap="round" d="M102 72 H184 M102 92 H174 M102 112 H148" />
      <path className="stroke-ink" fill="none" strokeWidth="5" strokeLinecap="round" d="M214 136 L238 62" />
      <g transform="rotate(-12 294 96)">
        <rect x="262" y="40" width="64" height="112" rx="13" className="fill-ink" />
        <circle cx="279" cy="57" r="6.5" className="fill-ink-2" />
        <circle cx="279" cy="74" r="3.5" className="fill-ink-2" />
      </g>
      {/* The buzz: two arcs, one after the other. */}
      <path className="library-draw stroke-rose-400" fill="none" strokeWidth="4.5" strokeLinecap="round" pathLength={100} style={at(500)} d="M342 50 q12 12 0 26" />
      <path className="library-draw stroke-rose-400" fill="none" strokeWidth="4.5" strokeLinecap="round" pathLength={100} style={at(800)} d="M356 40 q20 22 0 46" />
    </>
  );
}

function Helps({ labels }: { labels: boolean }) {
  return (
    <>
      <path {...line} className="stroke-emerald-300" d="M30 138 H180 C202 138 208 100 234 100 C260 100 266 138 288 138 H392" />
      {/* The dot rolls up to the bump and stops; a pause sign appears above it. */}
      <circle className="library-roll fill-ink" cx="158" cy="121" r="13" />
      <g className="library-pop" style={at(900)}>
        <rect x="150" y="76" width="5.5" height="19" rx="2.75" className="fill-emerald-600" />
        <rect x="161" y="76" width="5.5" height="19" rx="2.75" className="fill-emerald-600" />
      </g>
      {labels && (
        <text x="30" y="52" className={word}>
          A short pause before it opens
        </text>
      )}
    </>
  );
}

function Guides({ labels }: { labels: boolean }) {
  return (
    <>
      <path {...line} className="library-draw stroke-amber-300" pathLength={100} d="M40 152 H128 V116 H216 V80 H304 V44 H388" />
      <circle className="library-pop fill-ink" style={at(1100)} cx="346" cy="26" r="11" />
      {labels &&
        ["1", "2", "3"].map((step, index) => (
          <text key={step} x={80 + index * 88} y={176 - index * 36} className={word}>
            {step}
          </text>
        ))}
    </>
  );
}

/**
 * The drawing of a shelf. `labels`: the few words inside it, for the large tile; small tiles
 * leave them out, because they would be too small to read.
 */
export function TopicScene({ topic, labels = true, className = "" }: { topic: Topic; labels?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 420 190" aria-hidden="true" className={className}>
      {topic === "interruptions" && <Interruptions labels={labels} />}
      {topic === "phones" && <Phones />}
      {topic === "helps" && <Helps labels={labels} />}
      {topic === "guides" && <Guides labels={labels} />}
    </svg>
  );
}
