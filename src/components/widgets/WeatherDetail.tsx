"use client";

// The weather in detail (spec 45), opened by a click on a weather widget: the weather now, the next 24
// hours as temperature, precipitation or wind (swipe or scroll sideways), and the next 7 days with
// their range. Everything comes from the answer the widget already has; nothing is asked again.
import { useState } from "react";
import { ArrowUp } from "lucide-react";
import { fmtTime } from "@/lib/time/display";
import { dayParts, localTimeOf } from "@/lib/time/zoned";
import { RAIN_SHOWN_FROM, skyLabel, type WeatherDto } from "@/lib/widgets/weather";
import { SkyIcon, SOURCE_ICON, type Clock } from "./tiles";

type Tab = "temp" | "rain" | "wind";
const TABS: { id: Tab; label: string }[] = [
  { id: "temp", label: "Temperature" },
  { id: "rain", label: "Precipitation" },
  { id: "wind", label: "Wind" },
];

/** Width of one hour in the chart, and the chart's drawing height, in px. */
const COL = 52;
const CHART_H = 96;
const TOP = 22;

export function WeatherDetail({ weather, clock }: { weather: WeatherDto; clock: Clock }) {
  const [tab, setTab] = useState<Tab>("temp");
  const source = SOURCE_ICON[weather.source];
  const SourceIcon = source.icon;
  const hours = weather.hours;
  const hourLabel = (iso: string, i: number) => (i === 0 ? "Now" : fmtTime(localTimeOf(new Date(iso), clock.timeZone), clock.timeFormat));

  return (
    <div className="flex flex-col gap-5 px-5 pb-5">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-1 text-sm font-medium text-ink-2">
            <span className="truncate">{weather.place}</span>
            <SourceIcon aria-label={source.label} className="size-3 shrink-0 text-ink-3" strokeWidth={2} />
          </p>
          <p className="tabular text-[56px] leading-none font-medium tracking-display">{weather.temp}°</p>
        </div>
        <div className="flex flex-col items-end gap-0.5 text-right">
          <span className="flex items-center gap-1.5 text-sm font-semibold">
            <SkyIcon sky={weather.sky} isDay={weather.isDay} className="size-5" />
            {skyLabel(weather.sky, weather.isDay)}
          </span>
          <span className="tabular text-xs text-ink-2">
            H {weather.high}° · L {weather.low}°
          </span>
          <span className="tabular text-xs text-ink-3">Wind {weather.wind} km/h</span>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div role="tablist" aria-label="Next 24 hours" className="flex w-fit gap-1 rounded-full bg-raised p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`h-7 rounded-full px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 ${
                tab === t.id ? "bg-surface text-ink shadow-float" : "text-ink-2 hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div role="tabpanel" aria-label={TABS.find((t) => t.id === tab)?.label} tabIndex={0} className="scroll-thin -mx-5 snap-x overflow-x-auto px-5 pb-2 focus-visible:outline-none">
          <div className="relative" style={{ width: hours.length * COL }}>
            <div className="tabular flex text-[11px] font-medium text-ink-3">
              {hours.map((h, i) => (
                <span key={h.time} className="shrink-0 snap-start text-center" style={{ width: COL }}>
                  {hourLabel(h.time, i)}
                </span>
              ))}
            </div>
            <div className="mt-1.5 flex">
              {hours.map((h) => (
                <span key={h.time} className="grid shrink-0 place-items-center" style={{ width: COL }}>
                  <SkyIcon sky={h.sky} isDay={h.isDay} className="size-4" />
                </span>
              ))}
            </div>
            <Chart tab={tab} weather={weather} />
          </div>
        </div>
      </div>

      <Days weather={weather} />

      <p className="text-[11px] text-ink-3">
        Weather data by{" "}
        <a href="https://open-meteo.com/" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-ink">
          Open-Meteo.com
        </a>
      </p>
    </div>
  );
}

/** The 24 hours as a line (temperature, wind) or bars (chance of rain), with the values written above. */
function Chart({ tab, weather }: { tab: Tab; weather: WeatherDto }) {
  const hours = weather.hours;
  const width = hours.length * COL;
  const x = (i: number) => i * COL + COL / 2;

  if (tab === "rain") {
    return (
      <svg width={width} height={CHART_H + TOP + 16} className="mt-1 block" aria-label="Chance of rain each hour">
        <line x1={0} x2={width} y1={TOP + CHART_H} y2={TOP + CHART_H} className="stroke-line-subtle" />
        {hours.map((h, i) => {
          const barH = Math.max(2, (h.rain / 100) * CHART_H);
          return (
            <g key={h.time}>
              <rect x={x(i) - 9} y={TOP + CHART_H - barH} width={18} height={barH} rx={4} className={h.rain >= RAIN_SHOWN_FROM ? "fill-sky-500" : "fill-sky-200"} />
              <text x={x(i)} y={TOP + CHART_H - barH - 6} textAnchor="middle" className={`tabular text-[11px] font-semibold ${h.rain >= RAIN_SHOWN_FROM ? "fill-sky-700" : "fill-ink-3"}`}>
                {h.rain}%
              </text>
              {h.precip > 0 && (
                <text x={x(i)} y={TOP + CHART_H + 13} textAnchor="middle" className="tabular fill-ink-3 text-[10.5px]">
                  {h.precip} mm
                </text>
              )}
            </g>
          );
        })}
      </svg>
    );
  }

  const values = hours.map((h) => (tab === "temp" ? h.temp : h.wind));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const y = (v: number) => TOP + (max === min ? CHART_H / 2 : ((max - v) / (max - min)) * (CHART_H - 8) + 4);
  const line = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(values.length - 1)},${TOP + CHART_H} L${x(0)},${TOP + CHART_H} Z`;
  const stroke = tab === "temp" ? "stroke-amber-500" : "stroke-slate-500";
  const fill = tab === "temp" ? "fill-amber-500/10" : "fill-slate-500/10";
  return (
    <div>
      <svg width={width} height={CHART_H + TOP + 4} className="mt-1 block" aria-label={tab === "temp" ? "Temperature each hour" : "Wind speed each hour"}>
        <path d={area} className={fill} />
        <path d={line} fill="none" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" className={stroke} />
        {values.map((v, i) => (
          <g key={hours[i].time}>
            <circle cx={x(i)} cy={y(v)} r={3} className={`fill-surface ${stroke}`} strokeWidth={2} />
            <text x={x(i)} y={y(v) - 9} textAnchor="middle" className="tabular fill-ink text-[11px] font-semibold">
              {tab === "temp" ? `${v}°` : v}
            </text>
          </g>
        ))}
      </svg>
      {tab === "wind" && (
        <div className="flex text-ink-3">
          {hours.map((h) => (
            <span key={h.time} className="flex shrink-0 flex-col items-center gap-0.5 text-[10.5px]" style={{ width: COL }}>
              {/* The arrow points where the wind blows to; windDir is where it comes from. */}
              <ArrowUp aria-label={`from ${h.windDir} degrees`} className="size-3.5 text-ink-2" strokeWidth={2} style={{ transform: `rotate(${h.windDir + 180}deg)` }} />
              km/h
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** The next 7 days: day, sky, chance of rain, and the low to high range on one scale for the week. */
function Days({ weather }: { weather: WeatherDto }) {
  if (weather.days.length === 0) return null;
  const lowest = Math.min(...weather.days.map((d) => d.low));
  const highest = Math.max(...weather.days.map((d) => d.high));
  const span = Math.max(1, highest - lowest);
  return (
    <section aria-labelledby="days-title" className="flex flex-col gap-1">
      <h3 id="days-title" className="text-xs font-medium text-ink-3">
        Next 7 days
      </h3>
      <ul className="flex flex-col">
        {weather.days.map((day, i) => {
          const left = ((day.low - lowest) / span) * 100;
          const width = Math.max(4, ((day.high - day.low) / span) * 100);
          return (
            <li key={day.date} className="tabular grid grid-cols-[3.5rem_1.25rem_2.75rem_2rem_1fr_2rem] items-center gap-2 border-b border-line-subtle py-2 text-sm last:border-b-0">
              <span className="font-medium">{i === 0 ? "Today" : dayParts(day.date).weekday}</span>
              <SkyIcon sky={day.sky} isDay className="size-4" />
              <span className="text-xs font-semibold text-sky-700">{day.rain >= RAIN_SHOWN_FROM ? `${day.rain}%` : ""}</span>
              <span className="text-right text-ink-3">{day.low}°</span>
              <span className="relative h-1.5 rounded-full bg-muted">
                <span className="absolute inset-y-0 rounded-full bg-linear-to-r from-sky-400 to-amber-400" style={{ left: `${left}%`, width: `${Math.min(width, 100 - left)}%` }} />
                {i === 0 && (
                  <span
                    aria-hidden
                    className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-ink"
                    style={{ left: `${((Math.min(Math.max(weather.temp, lowest), highest) - lowest) / span) * 100}%` }}
                  />
                )}
              </span>
              <span className="font-medium">{day.high}°</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
