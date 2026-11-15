"use client";

// Under each contact on the People page (spec 29): what the user shares with them, and what they share
// with the user. The calendar's level is a small segmented choice (Off, Free/busy, Details) and the
// focus chart a switch; each change is saved at once (set_share) with a quiet confirmation, and goes
// back with the server's message when refused (R1). The other direction is one line with links.
import Link from "next/link";
import { useId, useState } from "react";
import { useAnnounce } from "@/components/calendar/Announcer";
import { SegmentedField, type FieldOption } from "@/components/settings/fields";
import { postJson } from "@/lib/client/post-json";
import { sharedWithYouText, type CalendarLevel, type ShareSetting } from "@/lib/shares/types";

const LEVELS: FieldOption<CalendarLevel>[] = [
  { value: "none", label: "Off" },
  { value: "busy", label: "Free/busy" },
  { value: "details", label: "Details" },
];

/** The same look as the editor's "All day" switch. */
const SWITCH_CLASS =
  "relative h-5 w-9 shrink-0 cursor-pointer appearance-none rounded-full bg-line transition-colors checked:bg-ink before:absolute before:top-0.5 before:left-0.5 before:size-4 before:rounded-full before:bg-white before:shadow-sm before:transition-transform checked:before:translate-x-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60";

export function ShareRow({
  contactId,
  userId,
  name,
  out: saved,
  shared,
}: {
  contactId: string;
  userId: string;
  name: string;
  /** What the user shares with this contact now. */
  out: ShareSetting;
  /** What this contact shares with the user. */
  shared: ShareSetting;
}) {
  const announce = useAnnounce();
  const labelId = useId();
  const calendarId = useId();
  const [setting, setSetting] = useState<ShareSetting>(saved);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function save(next: ShareSetting) {
    const before = setting;
    setSetting(next);
    setBusy(true);
    setNote(null);
    const answer = await postJson(`/api/contacts/${contactId}/share`, next);
    setBusy(false);
    if (!answer.ok) {
      setSetting(before);
      setNote({ tone: "error", text: answer.message });
      return;
    }
    setNote({ tone: "ok", text: "Saved" });
    announce(`Sharing with ${name} saved.`);
  }

  const theirs = sharedWithYouText(shared);

  return (
    <div className="flex w-full flex-col gap-2 rounded-xl bg-raised/60 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p id={labelId} className="min-w-0 flex-1 text-xs font-medium text-ink-2">
          You share with {name}
        </p>
        <span id={calendarId} className="text-xs text-ink-3">
          Calendar
        </span>
        <SegmentedField value={setting.calendar} options={LEVELS} labelledBy={`${labelId} ${calendarId}`} disabled={busy} onChange={(calendar) => void save({ ...setting, calendar })} />
        <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-ink-2">
          Focus chart
          <input
            type="checkbox"
            role="switch"
            checked={setting.focus}
            disabled={busy}
            aria-label={`Share your focus chart with ${name}`}
            onChange={(e) => void save({ ...setting, focus: e.target.checked })}
            className={SWITCH_CLASS}
          />
        </label>
        <span role="status" className={note ? `text-xs ${note.tone === "error" ? "text-danger" : "text-ink-3"}` : "sr-only"}>
          {note?.text}
        </span>
      </div>
      <p className="text-xs text-ink-3">
        {theirs ?? `${name} shares nothing with you.`}
        {shared.calendar !== "none" && (
          <>
            {" · "}
            <Link href={`/?share=${userId}`} className="font-medium text-ink-2 underline-offset-2 hover:underline">
              Show in calendar
            </Link>
          </>
        )}
        {shared.focus && (
          <>
            {" · "}
            <Link href={`/analytics?person=${userId}`} className="font-medium text-ink-2 underline-offset-2 hover:underline">
              View focus chart
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
