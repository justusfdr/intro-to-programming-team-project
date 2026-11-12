"use client";

// Card "Preferences", copied from the prototype: time format, visible hours, and the time zone (here
// instead of the prototype's week start, default view and check-in time, which are decided out:
// weeks start on Monday, the calendar has one view, the check-in is gone). Each change is saved at once.
import { useId } from "react";
import { SlidersHorizontal } from "lucide-react";
import { FormMessage } from "@/components/account/FormMessage";
import { Card } from "@/components/ui/Card";
import type { SettingsData } from "@/lib/settings/types";
import { fmtHourSetting, type TimeFormat } from "@/lib/time/display";
import { FieldRow, SegmentedField, SelectField, SettingsCardHeader, type FieldOption } from "./fields";
import { useSaveSettings } from "./useSaveSettings";

const FORMAT_OPTIONS: FieldOption<TimeFormat>[] = [
  { value: "12h", label: "12-hour" },
  { value: "24h", label: "24-hour" },
];

/** The time zones the server knows (from the page, so server and browser render the same list), with the saved one always in it. */
function timeZoneOptions(current: string, known: string[]): FieldOption<string>[] {
  const names = known.includes(current) ? known : [...known, current].sort();
  return names.map((name) => ({ value: name, label: name.replaceAll("_", " ") }));
}

export function PreferencesCard({ settings, timeZones }: { settings: SettingsData; timeZones: string[] }) {
  const uid = useId();
  const { save, busy, failure } = useSaveSettings();
  const fmt = settings.timeFormat;

  // From on or past To: To moves along, so at least one hour stays visible (as in the prototype).
  const setFrom = (from: number) => {
    const patch: Partial<SettingsData> = { dayStartHour: from };
    if (from >= settings.dayEndHour) patch.dayEndHour = Math.min(24, from + 1);
    void save(patch);
  };

  const fromOptions: FieldOption<number>[] = Array.from({ length: 24 }, (_, h) => ({ value: h, label: fmtHourSetting(h, fmt) }));
  // To starts one hour after From and goes up to midnight (24).
  const toOptions: FieldOption<number>[] = Array.from({ length: 24 - settings.dayStartHour }, (_, i) => {
    const h = settings.dayStartHour + 1 + i;
    return { value: h, label: fmtHourSetting(h, fmt) };
  });

  const ids = {
    title: `${uid}-title`,
    format: `${uid}-format`,
    formatHint: `${uid}-format-hint`,
    hours: `${uid}-hours`,
    hoursHint: `${uid}-hours-hint`,
    from: `${uid}-from`,
    to: `${uid}-to`,
    zone: `${uid}-zone`,
    zoneHint: `${uid}-zone-hint`,
  };

  return (
    <Card role="region" aria-labelledby={ids.title} className="p-5 md:p-6">
      <SettingsCardHeader icon={SlidersHorizontal} title="Preferences" titleId={ids.title} description="How your calendar shows times." />

      <div className="mt-5 divide-y divide-line-subtle">
        <FieldRow label="Time format" labelId={ids.format} hintId={ids.formatHint} hint={`Example: ${fmt === "24h" ? "13:30" : "1:30pm"}`}>
          <SegmentedField
            value={fmt}
            options={FORMAT_OPTIONS}
            labelledBy={ids.format}
            describedBy={ids.formatHint}
            disabled={busy}
            onChange={(timeFormat) => void save({ timeFormat })}
          />
        </FieldRow>

        <FieldRow label="Visible hours" labelId={ids.hours} hintId={ids.hoursHint} hint="Hours shown in the week view.">
          <label htmlFor={ids.from} className="sr-only">
            Visible from
          </label>
          <SelectField id={ids.from} value={settings.dayStartHour} options={fromOptions} ariaDescribedBy={ids.hoursHint} disabled={busy} onChange={setFrom} />
          <span aria-hidden="true" className="text-sm text-ink-3">
            to
          </span>
          <label htmlFor={ids.to} className="sr-only">
            Visible to
          </label>
          <SelectField
            id={ids.to}
            value={settings.dayEndHour}
            options={toOptions}
            ariaDescribedBy={ids.hoursHint}
            disabled={busy}
            onChange={(dayEndHour) => void save({ dayEndHour })}
          />
        </FieldRow>

        <FieldRow label="Time zone" htmlFor={ids.zone} hintId={ids.zoneHint} hint="Your calendar, weeks and analytics use it.">
          <SelectField
            id={ids.zone}
            value={settings.timeZone}
            options={timeZoneOptions(settings.timeZone, timeZones)}
            ariaDescribedBy={ids.zoneHint}
            disabled={busy}
            className="w-full sm:w-64"
            onChange={(timeZone) => void save({ timeZone })}
          />
        </FieldRow>
      </div>
      {failure && <FormMessage tone="error" text={failure.message} />}
    </Card>
  );
}
