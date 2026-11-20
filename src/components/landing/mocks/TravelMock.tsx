// "On the way" (spec 62): an event with a place, the way there on a small map, and a car that drives
// it. On the pinned stage the scroll moves the car (StoryScroll.tsx); as drawn here the picture shows
// its end: the car has arrived. Decoration: what it shows stands in the words next to it.
import { Bike, Bus, Car, Check, Footprints, MapPin } from "lucide-react";
import { timing } from "./parts";

/** The road from home to the campus, in the map's own units (408 by 200). It ends heading east. */
export const ROAD = "M40 158 C92 158 104 112 160 108 S236 140 276 92 S316 56 340 56";
/** Where the car stands when it has arrived. */
const PARKED = "translate(340 56) rotate(0)";

const OTHER_WAYS = [
  { name: "bike", icon: Bike },
  { name: "foot", icon: Footprints },
  { name: "bus", icon: Bus },
];

export function TravelMock() {
  return (
    <div aria-hidden data-story-drive className="flex w-full max-w-[440px] flex-col gap-3">
      <div className="l-rise flex items-center gap-3 rounded-card border border-line-subtle bg-surface p-4 shadow-float">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-raised text-ink-2">
          <MapPin className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold tracking-snug text-ink">Group project</p>
          <p className="truncate text-[12px] text-ink-2 tabular">11:15 AM · Nova SBE, Carcavelos</p>
        </div>
        {/* One of three lines, depending on how far the car is (landing.css, --u). */}
        <span className="story-leave grid shrink-0 justify-items-end text-[12px] font-semibold">
          <span className="inline-flex h-7 items-center rounded-full bg-warning-soft px-2.5 text-warning">Leave in 5 min</span>
          <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-raised px-2.5 text-ink">
            <span className="l-live size-1.5 rounded-full bg-today" />
            On the way
          </span>
          <span className="inline-flex h-7 items-center gap-1 rounded-full bg-success-soft px-2.5 text-success tabular">
            <Check className="size-3.5" strokeWidth={3} />
            Arrived 11:12
          </span>
        </span>
      </div>

      <div className="l-rise overflow-hidden rounded-card border border-line-subtle bg-surface shadow-float" style={timing({ d: 140 })}>
        <svg viewBox="0 0 408 200" className="block w-full">
          <rect width="408" height="200" className="fill-raised" />
          {/* A park, the sea, and the streets around the way. */}
          <path d="M34 22h62a14 14 0 0 1 14 14v22a14 14 0 0 1-14 14H34a14 14 0 0 1-14-14V36a14 14 0 0 1 14-14Z" className="fill-emerald-100/70" />
          <path d="M236 200c26-34 84-22 172-58v58Z" className="fill-sky-100" />
          <g fill="none" strokeLinecap="round" className="stroke-surface" strokeWidth="7">
            <path d="M0 88c70-10 130 6 200-4s140-30 208-20" />
            <path d="M126 0c-6 60 10 130 4 200" />
            <path d="M0 150c60 16 150 20 230 4" />
            <path d="M246 0c-8 50 14 96 60 132" />
            <path d="M330 0v128" />
            <path d="M0 34c90 10 170-12 250 2s110 6 158-4" />
          </g>

          {/* The whole way, and over it the part already driven. */}
          <path data-story-road d={ROAD} fill="none" strokeWidth="5" strokeLinecap="round" className="stroke-ink/20" />
          <path data-story-driven d={ROAD} fill="none" strokeWidth="5" strokeLinecap="round" className="stroke-ink" />

          {/* Home and the place of the event. */}
          <circle cx="40" cy="158" r="6" strokeWidth="3" className="fill-surface stroke-ink" />
          <text x="40" y="182" textAnchor="middle" className="fill-ink-2 text-[10px] font-medium">
            Home
          </text>
          <circle cx="366" cy="46" r="10" className="fill-today" />
          <circle cx="366" cy="46" r="3.5" className="fill-surface" />
          <text x="366" y="26" textAnchor="middle" className="fill-ink text-[10px] font-semibold">
            Nova SBE
          </text>

          {/* The car, seen from above and drawn heading east; StoryScroll turns it along the road. */}
          <g data-story-car data-parked={PARKED} transform={PARKED}>
            <circle r="15" className="fill-surface" />
            <circle r="15" fill="none" className="stroke-line" />
            <rect x="-10" y="-6" width="20" height="12" rx="4.5" className="fill-ink" />
            <rect x="1" y="-4.2" width="4.5" height="8.4" rx="1.5" className="fill-surface/75" />
            <rect x="-7" y="-3.8" width="3" height="7.6" rx="1.2" className="fill-surface/40" />
            <circle cx="9" cy="-3.4" r="1.1" className="fill-amber-300" />
            <circle cx="9" cy="3.4" r="1.1" className="fill-amber-300" />
          </g>
        </svg>

        <div className="flex items-center gap-2 border-t border-line-subtle p-3 text-[12px]">
          <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-ink px-2.5 font-medium text-white tabular">
            <Car className="size-3.5" />
            12 min by car
          </span>
          {OTHER_WAYS.map((way) => (
            <span key={way.name} className="flex size-7 items-center justify-center rounded-full border border-line-subtle text-ink-3">
              <way.icon className="size-3.5" />
            </span>
          ))}
          <span className="ml-auto text-ink-3 tabular">Leave by 11:00 AM</span>
        </div>
      </div>
    </div>
  );
}
