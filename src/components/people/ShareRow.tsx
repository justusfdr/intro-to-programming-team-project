"use client";

// What the user shares with one contact (spec 53, from specs 29 and 33), on the contact's profile page:
// the calendar's level as a small segmented choice (Off, Free/busy, Details), saved at once (set_share)
// with a quiet confirmation, and back to the saved level with the server's message when refused (R1).
// Next to it, in plain words, what each level reveals (E10).
// The database's share also has a "focus" flag (the focus chart of spec 29), which set_share needs. The
// app does not offer it: every save sends the stored value back unchanged (shareBody), so a share made
// earlier is never changed by accident.
import { useId, useState } from "react";
import { useAnnounce } from "@/components/calendar/Announcer";
import { SegmentedField, type FieldOption } from "@/components/settings/fields";
import { postJson } from "@/lib/client/post-json";
import type { CalendarLevel, ShareSetting } from "@/lib/shares/types";

const LEVELS: FieldOption<CalendarLevel>[] = [
  { value: "none", label: "Off" },
  { value: "busy", label: "Free/busy" },
  { value: "details", label: "Details" },
];

/** What each level reveals, said next to the choice (E10). */
export const SHARE_LEVELS_NOTE =
  "Free/busy shows when you are busy, to the minute. Details also shows titles and places, including events from Outlook.";

/** The body of set_share for a new calendar level: the focus flag stays exactly as it is saved. */
export function shareBody(saved: ShareSetting, calendar: CalendarLevel): ShareSetting {
  return { calendar, focus: saved.focus };
}

export function ShareRow({
  contactId,
  name,
  out: saved,
}: {
  contactId: string;
  name: string;
  /** What the user shares with this contact now. */
  out: ShareSetting;
}) {
  const announce = useAnnounce();
  const labelId = useId();
  const calendarId = useId();
  const noteId = useId();
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

  return (
    <div className="flex w-full flex-col gap-2 rounded-xl bg-raised/60 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p id={labelId} className="min-w-0 flex-1 text-xs font-medium text-ink-2">
          You share with {name}
        </p>
        <span id={calendarId} className="text-xs text-ink-3">
          Calendar
        </span>
        <SegmentedField
          value={setting.calendar}
          options={LEVELS}
          labelledBy={`${labelId} ${calendarId}`}
          describedBy={noteId}
          disabled={busy}
          onChange={(calendar) => void save(shareBody(setting, calendar))}
        />
        <span role="status" className={note ? `text-xs ${note.tone === "error" ? "text-danger" : "text-ink-3"}` : "sr-only"}>
          {note?.text}
        </span>
      </div>
      <p id={noteId} className="text-xs text-ink-3">
        {SHARE_LEVELS_NOTE}
      </p>
    </div>
  );
}
