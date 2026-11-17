// The six widgets of the sidebar (spec 45), drawn from the data they are given. They hold no state and
// fetch nothing: WidgetArea reads the data and the clock and passes them in.
// One look for all: a white tile with a fine border and 16 px corners (rounded-card), rows inside with
// 8 px corners like the sidebar links, buttons as round pills like Button, Geist, lucide at stroke 1.8.
import Link from "next/link";
import {
  Bike,
  CalendarCheck,
  CalendarDays,
  Car,
  Check,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Footprints,
  House,
  ListChecks,
  LocateFixed,
  MapPin,
  Moon,
  Navigation,
  Play,
  Sun,
  Target,
  Timer,
  TramFront,
  Users,
  type LucideIcon,
} from "lucide-react";
import { buttonClass } from "@/components/ui/Button";
import { GOAL_ICONS, GoalTile } from "@/components/goals/GoalTile";
import { goalColor } from "@/lib/goals/colors";
import type { TravelMode } from "@/lib/settings/types";
import { fmtRange, fmtTime, type TimeFormat } from "@/lib/time/display";
import { localTimeOf } from "@/lib/time/zoned";
import type { TravelAnswer } from "@/lib/travel/types";
import { durationText, leaveLevel, leaveLine, minutesUntil, type LeaveLevel } from "@/lib/widgets/leave";
import type { WidgetEvent, WidgetGoal, WidgetSize } from "@/lib/widgets/types";
import { RAIN_SHOWN_FROM, skyLabel, type Sky, type WeatherAnswer, type WeatherSource } from "@/lib/widgets/weather";

/** What every widget needs to show times. */
export type Clock = { now: Date; timeZone: string; timeFormat: TimeFormat };

const time = (iso: string, c: Clock) => fmtTime(localTimeOf(new Date(iso), c.timeZone), c.timeFormat);
const range = (start: string, end: string, c: Clock) =>
  fmtRange(localTimeOf(new Date(start), c.timeZone), localTimeOf(new Date(end), c.timeZone), c.timeFormat);

/** The tile every widget sits in. `tone` replaces the white surface and border (leave, a met goal). */
export function Tile({ tone, className = "", children }: { tone?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`relative h-full w-full overflow-hidden rounded-card border ${tone ?? "border-line-subtle bg-surface text-ink"} ${className}`}>
      {children}
    </div>
  );
}

/** A 1x1 widget: a picture, a value and a label, centred, on the same three lines everywhere. */
function Small({ picture, value, label, tone, title }: { picture: React.ReactNode; value: string; label: string; tone?: string; title: string }) {
  return (
    <Tile tone={tone}>
      <div role="img" aria-label={title} className="flex h-full flex-col items-center justify-center gap-px px-1.5 text-center">
        <span className="grid h-[18px] place-items-center">{picture}</span>
        <span className="tabular whitespace-nowrap text-[15px] font-semibold leading-tight tracking-snug">{value}</span>
        <span className="max-w-full truncate text-[11px] font-medium leading-tight opacity-80">{label}</span>
      </div>
    </Tile>
  );
}

// ——— Weather ———

const SKY_ICON: Record<Sky, { day: LucideIcon; night: LucideIcon; tint: string }> = {
  clear: { day: Sun, night: Moon, tint: "text-amber-500" },
  partly: { day: CloudSun, night: CloudMoon, tint: "text-amber-500" },
  cloudy: { day: Cloud, night: Cloud, tint: "text-slate-400" },
  fog: { day: CloudFog, night: CloudFog, tint: "text-slate-400" },
  drizzle: { day: CloudDrizzle, night: CloudDrizzle, tint: "text-sky-600" },
  rain: { day: CloudRain, night: CloudRain, tint: "text-sky-600" },
  snow: { day: CloudSnow, night: CloudSnow, tint: "text-sky-500" },
  storm: { day: CloudLightning, night: CloudLightning, tint: "text-indigo-500" },
};

function SkyIcon({ sky, isDay, className, tinted = true }: { sky: Sky; isDay: boolean; className: string; tinted?: boolean }) {
  const s = SKY_ICON[sky];
  const Icon = isDay ? s.day : s.night;
  const tint = sky === "clear" && !isDay ? "text-indigo-400" : s.tint;
  return <Icon aria-hidden className={`${className} ${tinted ? tint : "text-ink-2"}`} strokeWidth={1.8} />;
}

const SOURCE_ICON: Record<WeatherSource, { icon: LucideIcon; label: string }> = {
  device: { icon: Navigation, label: "Your location" },
  event: { icon: CalendarDays, label: "Place of your event" },
  home: { icon: House, label: "Your home address" },
};

/**
 * The weather (R47). `onLocate`: offered while the browser has not been asked for the location yet; a
 * click asks it once. Nothing moves: the sky is an icon, the colour is in the icon and the chance of rain.
 */
export function WeatherWidget({ size, answer, clock, onLocate }: { size: WidgetSize; answer: WeatherAnswer | null; clock: Clock; onLocate?: () => void }) {
  if (!answer) {
    return (
      <Tile>
        <span className="sr-only">Loading the weather</span>
      </Tile>
    );
  }
  if (answer.status !== "ok") {
    const missingHome = answer.status === "no_place";
    if (size === "1x1") return <Small title={answer.message} picture={<Cloud aria-hidden className="size-4 text-ink-3" strokeWidth={1.8} />} value="–" label={missingHome ? "No place" : "Offline"} />;
    return (
      <Tile>
        <div className="flex h-full flex-col items-start justify-center gap-1 p-3">
          <Cloud aria-hidden className="size-5 text-ink-3" strokeWidth={1.8} />
          <p className="text-xs text-ink-2">{answer.message}</p>
          {missingHome && (
            <Link href="/settings" className="text-xs font-semibold text-ink underline-offset-2 hover:underline">
              Open Settings
            </Link>
          )}
          {onLocate && <LocateButton onLocate={onLocate} withText />}
        </div>
      </Tile>
    );
  }
  const w = answer.weather;
  const label = skyLabel(w.sky, w.isDay);
  const title = `${w.place}: ${w.temp} degrees, ${label}, high ${w.high}, low ${w.low}`;
  if (size === "1x1") {
    return <Small title={title} picture={<SkyIcon sky={w.sky} isDay={w.isDay} className="size-[18px]" />} value={`${w.temp}°`} label={label} />;
  }
  const source = SOURCE_ICON[w.source];
  const SourceIcon = source.icon;
  return (
    <Tile>
      <div className="flex h-full flex-col p-3">
        <div className="flex h-4 items-center gap-1 text-xs font-medium text-ink-2">
          <span className="truncate">{w.place}</span>
          <SourceIcon aria-label={source.label} className="size-[11px] shrink-0 text-ink-3" strokeWidth={2} />
          {onLocate && <LocateButton onLocate={onLocate} />}
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <span className="tabular text-[30px] font-medium leading-none tracking-display">{w.temp}°</span>
          <span className="flex min-w-0 flex-col items-end gap-px text-right">
            <span className="flex items-center gap-1 whitespace-nowrap text-xs font-medium">
              <SkyIcon sky={w.sky} isDay={w.isDay} className="size-4" />
              {label}
            </span>
            <span className="tabular whitespace-nowrap text-[11px] text-ink-3">
              H {w.high}° · L {w.low}°
            </span>
          </span>
        </div>
        <ol className="tabular mt-auto grid grid-cols-4 border-t border-line-subtle pt-1.5" aria-label="Next hours">
          {w.hours.slice(0, 4).map((h) => (
            <li key={h.time} className="flex flex-col items-center gap-px text-[11px] leading-tight text-ink-3">
              <span>{fmtTime(localTimeOf(new Date(h.time), clock.timeZone), clock.timeFormat)}</span>
              <span className="flex h-3.5 items-center gap-0.5">
                <SkyIcon sky={h.sky} isDay={h.isDay} className="size-3.5" tinted={false} />
                {h.rain >= RAIN_SHOWN_FROM && <span className="font-semibold text-sky-700">{h.rain}%</span>}
              </span>
              <span className="text-xs font-semibold text-ink">{h.temp}°</span>
            </li>
          ))}
        </ol>
      </div>
    </Tile>
  );
}

function LocateButton({ onLocate, withText = false }: { onLocate: () => void; withText?: boolean }) {
  return (
    <button
      type="button"
      onClick={onLocate}
      title="Use my location"
      aria-label="Use my location for the weather"
      className={`ml-auto inline-flex items-center gap-1 rounded-full text-ink-3 transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 ${withText ? "mt-1 text-xs font-semibold" : "p-0.5"}`}
    >
      <LocateFixed aria-hidden className="size-3.5" strokeWidth={1.8} />
      {withText && "Use my location"}
    </button>
  );
}

// ——— Time to leave ———

const LEVEL_TONE: Record<LeaveLevel | "none", string> = {
  green: "border-emerald-200 bg-emerald-50 text-emerald-700",
  amber: "border-amber-200 bg-amber-50 text-amber-800",
  orange: "border-orange-300 bg-orange-50 text-orange-700",
  red: "border-red-600 bg-red-600 text-white",
  now: "border-red-600 bg-red-600 text-white widget-pulse",
  late: "border-red-900 bg-red-900 text-red-100",
  none: "border-line-subtle bg-surface text-ink-3",
};

const MODE_ICON: Record<TravelMode, { icon: LucideIcon; word: string }> = {
  driving: { icon: Car, word: "by car" },
  cycling: { icon: Bike, word: "by bike" },
  walking: { icon: Footprints, word: "on foot" },
  transit: { icon: TramFront, word: "by public transport" },
};

/**
 * The trip answer for the event to leave for: undefined while it is still being asked, null when the
 * server has none for it (for example a web link), else what travel_times answered (R27).
 */
export type TripTravel = TravelAnswer | null | undefined;

/** The trip to leave for, worked out: minutes until leaving and its level; null without a time to leave. */
export function tripState(travel: TripTravel, now: Date) {
  if (!travel || travel.status !== "ok") return null;
  const minutes = minutesUntil(new Date(travel.leaveAt), now);
  return { minutes, level: leaveLevel(minutes), mode: travel.mode, leaveAt: travel.leaveAt, trip: travel.minutes };
}

export function LeaveWidget({ size, trip, travel, clock }: { size: WidgetSize; trip: WidgetEvent | null; travel: TripTravel; clock: Clock }) {
  const state = tripState(travel, clock.now);
  if (!trip || !state) {
    const why = !trip
      ? "No trip left today"
      : travel === undefined
        ? "Working out the trip"
        : travel === null
          ? "Travel time not available"
          : travel.status !== "ok"
            ? travel.message
            : "";
    const label = !trip ? "No trip" : travel === undefined ? "…" : travel?.status === "no_home" ? "No home" : "No route";
    if (size === "1x1") return <Small tone={LEVEL_TONE.none} title={why} picture={<MapPin aria-hidden className="size-4" strokeWidth={1.8} />} value="–" label={label} />;
    return (
      <Tile tone={LEVEL_TONE.none}>
        <div className="flex h-full items-center gap-2.5 px-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-raised">
            <MapPin aria-hidden className="size-4" strokeWidth={1.8} />
          </span>
          <span className="min-w-0 truncate text-xs">{why}</span>
        </div>
      </Tile>
    );
  }
  const { icon: Mode, word } = MODE_ICON[state.mode];
  const line = leaveLine(state.minutes);
  const title = `${line} for ${trip.title}, at ${time(state.leaveAt, clock)}, ${durationText(state.trip)} ${word}`;
  if (size === "1x1") {
    const value = state.level === "now" ? "Now" : durationText(Math.abs(state.minutes));
    const label = state.level === "late" ? "late" : state.level === "now" ? "leave" : "to leave";
    return <Small tone={LEVEL_TONE[state.level]} title={title} picture={<Mode aria-hidden className="size-4" strokeWidth={1.8} />} value={value} label={label} />;
  }
  const solid = state.level === "red" || state.level === "now" || state.level === "late";
  return (
    <Tile tone={LEVEL_TONE[state.level]}>
      <div role="img" aria-label={title} className="flex h-full items-center gap-2.5 px-3">
        <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${solid ? "bg-white/15" : "bg-white/70"}`}>
          <Mode aria-hidden className="size-4" strokeWidth={1.8} />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="tabular truncate text-sm font-semibold tracking-snug">{line}</span>
          <span className="tabular truncate text-xs font-medium opacity-80">
            {time(state.leaveAt, clock)} · {durationText(state.trip)}
          </span>
        </span>
      </div>
    </Tile>
  );
}

/** The leave line inside "Next up": a row with 8 px corners in the leave colour. */
function LeaveRow({ travel, clock }: { travel: TripTravel; clock: Clock }) {
  const state = tripState(travel, clock.now);
  if (!state) return null;
  const { icon: Mode } = MODE_ICON[state.mode];
  return (
    <div className={`tabular flex h-7 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2 text-xs font-semibold ${LEVEL_TONE[state.level]}`}>
      <Mode aria-hidden className="size-3.5 shrink-0" strokeWidth={1.8} />
      <span className="truncate">{leaveLine(state.minutes)}</span>
      <span className="ml-auto font-medium opacity-80">{time(state.leaveAt, clock)}</span>
    </div>
  );
}

// ——— Next up ———

/** The place in a few words: the part before the first comma ("Nova SBE"). */
function shortPlace(location: string | null): string | null {
  const first = location?.split(",")[0]?.trim() ?? "";
  return first === "" ? null : first;
}

export function NextWidget({
  size,
  next,
  after,
  tomorrow,
  travel,
  clock,
}: {
  size: WidgetSize;
  next: WidgetEvent | null;
  after: { title: string; start: string } | null;
  tomorrow: { title: string; start: string } | null;
  /** The trip answer when `next` is the event to leave for. */
  travel: TripTravel;
  clock: Clock;
}) {
  if (!next) {
    return (
      <Tile>
        <div className="flex h-full flex-col items-center justify-center gap-1 px-3 text-center">
          <span className="grid size-7 place-items-center rounded-lg bg-raised text-ink-3">
            <CalendarCheck aria-hidden className="size-4" strokeWidth={1.8} />
          </span>
          <p className="mt-1 text-sm font-semibold tracking-snug">Nothing else today</p>
          <p className="tabular max-w-full truncate text-xs text-ink-2">
            {tomorrow ? `Tomorrow ${time(tomorrow.start, clock)} · ${tomorrow.title}` : "Nothing tomorrow either"}
          </p>
        </div>
      </Tile>
    );
  }
  const start = new Date(next.start).getTime();
  const end = new Date(next.end).getTime();
  const nowMs = clock.now.getTime();
  const running = start <= nowMs;
  const color = next.goal ? goalColor(next.goal.look.color) : null;
  const accent = color?.text ?? "text-ink";
  const when = running ? `${durationText(Math.max(0, Math.ceil((end - nowMs) / 60_000)))} left` : `in ${durationText(Math.max(0, Math.ceil((start - nowMs) / 60_000)))}`;
  const place = shortPlace(next.location);
  const tall = size === "3x4";
  return (
    <Tile>
      <div className="flex h-full flex-col gap-2 p-3">
        <div className="flex items-center gap-2">
          <GoalTile look={next.goal?.look ?? null} size="md" />
          <span className="text-xs font-medium text-ink-3">{running ? "Now" : "Next up"}</span>
          <span className={`tabular ml-auto whitespace-nowrap text-xs font-semibold ${accent}`}>{when}</span>
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-snug tracking-snug">{next.title}</p>
          <p className="tabular truncate text-xs text-ink-2">
            {tall ? range(next.start, next.end, clock) : `${time(next.start, clock)}${place ? ` · ${place}` : ""}`}
          </p>
          {tall && place && (
            <p className="flex items-center gap-1 truncate text-xs text-ink-2">
              <MapPin aria-hidden className="size-3 shrink-0 text-ink-3" strokeWidth={1.8} />
              <span className="truncate">{next.location}</span>
            </p>
          )}
        </div>
        {tall && (
          <div className="flex flex-col gap-1.5 text-xs text-ink-2">
            {next.guests > 0 && (
              <span className="flex items-center gap-1.5">
                <Users aria-hidden className="size-3.5 text-ink-3" strokeWidth={1.8} />
                {next.guests === 1 ? "1 guest" : `${next.guests} guests`}
              </span>
            )}
            {next.todos.total > 0 && (
              <span className="tabular flex items-center gap-1.5">
                <ListChecks aria-hidden className="size-3.5 text-ink-3" strokeWidth={1.8} />
                {next.todos.done} of {next.todos.total} to-dos done
              </span>
            )}
          </div>
        )}
        <div className="mt-auto flex flex-col gap-2">
          {running ? (
            <div className="flex flex-col gap-1">
              <div className="h-1 overflow-hidden rounded-full bg-muted">
                <div className={`h-full rounded-full ${color?.dot ?? "bg-ink"}`} style={{ width: `${Math.min(100, Math.max(0, ((nowMs - start) / (end - start)) * 100))}%` }} />
              </div>
              <span className="tabular text-[11px] text-ink-3">Until {time(next.end, clock)}</span>
            </div>
          ) : (
            <LeaveRow travel={travel} clock={clock} />
          )}
          {tall && after && (
            <p className="tabular truncate border-t border-line-subtle pt-2 text-xs text-ink-2">
              Then {after.title} at {time(after.start, clock)}
            </p>
          )}
        </div>
      </div>
    </Tile>
  );
}

// ——— Goal ———

const R = 15;
const CIRCLE = 2 * Math.PI * R;

/** Without a goal: an invitation to add one. */
export function GoalWidget({ goal }: { goal: WidgetGoal | null }) {
  if (!goal) {
    return (
      <Link href="/goals" className="block h-full rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20">
        <Small title="Add a goal" picture={<Target aria-hidden className="size-4 text-ink-3" strokeWidth={1.8} />} value="Goal" label="add one" />
      </Link>
    );
  }
  const color = goalColor(goal.look.color);
  const Icon = GOAL_ICONS[goal.look.icon];
  const share = goal.target > 0 ? Math.min(1, goal.done / goal.target) : 0;
  const unit = goal.unit === "hours" ? " h" : "";
  const title = `${goal.title}: ${goal.done} of ${goal.target}${unit} this week${goal.met ? ", done" : ""}`;
  return (
    <Link href="/goals" className="block h-full rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20">
      <Tile tone={goal.met ? color.block : undefined}>
        <div role="img" aria-label={title} className="flex h-full flex-col items-center justify-center gap-0.5">
          <span className={`relative grid size-9 place-items-center ${color.text}`}>
            <svg viewBox="0 0 36 36" aria-hidden className="absolute inset-0 size-9 -rotate-90">
              <circle cx="18" cy="18" r={R} fill="none" className={`${color.stroke} opacity-20`} strokeWidth="3.5" />
              <circle
                cx="18"
                cy="18"
                r={R}
                fill="none"
                className={color.stroke}
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeDasharray={`${(share * CIRCLE).toFixed(1)} ${CIRCLE.toFixed(1)}`}
              />
            </svg>
            <Icon aria-hidden className="size-[15px]" strokeWidth={2} />
            {goal.met && (
              <span className={`absolute -right-1 -top-0.5 grid size-3.5 place-items-center rounded-full text-white ${color.dot}`}>
                <Check aria-hidden className="size-2.5" strokeWidth={3.2} />
              </span>
            )}
          </span>
          <span className={`tabular text-[11px] font-medium leading-tight ${goal.met ? "font-semibold" : "text-ink-3"}`}>
            {goal.met ? "Done" : `${goal.done} of ${goal.target}${unit}`}
          </span>
        </div>
      </Tile>
    </Link>
  );
}

// ——— Focus today and free time ———

export function FocusWidget({ minutes }: { minutes: number }) {
  return (
    <Link href="/focus" className="block h-full rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20">
      <Small
        title={`Focused ${durationText(minutes)} today`}
        picture={<Timer aria-hidden className="size-4 text-ink" strokeWidth={1.8} />}
        value={durationText(minutes)}
        label="today"
      />
    </Link>
  );
}

export function FreeWidget({ free, clock }: { free: { start: string; end: string } | null; clock: Clock }) {
  if (!free) {
    return (
      <Tile>
        <div className="flex h-full items-center px-3 text-xs text-ink-3">No free time left today</div>
      </Tile>
    );
  }
  const minutes = Math.round((new Date(free.end).getTime() - new Date(free.start).getTime()) / 60_000);
  return (
    <Tile>
      <div className="flex h-full items-center justify-between gap-2 pl-3 pr-2.5">
        <span className="flex min-w-0 flex-col">
          <span className="tabular text-[11px] font-medium text-ink-3">Free · {durationText(minutes)}</span>
          <span className="tabular truncate text-sm font-semibold tracking-snug">{range(free.start, free.end, clock)}</span>
        </span>
        <Link href="/focus" className={buttonClass("primary", "sm", "shrink-0 gap-1")}>
          <Play aria-hidden className="size-3" strokeWidth={2.4} />
          Focus
        </Link>
      </div>
    </Tile>
  );
}
