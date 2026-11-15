"use client";

// Spec 37 (R67, R68): under a draft, the people each proposed event invites: their photo or initials
// (a demo contact in their colour) and name. While the draft is open, each can be taken off (never
// added) with a small button: that is app.chat_draft_remove_person with the version the screen last saw
// (R4); a refusal shows the server's sentence. A demo contact is taken into account for the time but
// gets no invitation, and the card says so. Applying the draft invites the real contacts.
import { useAnnounce } from "@/components/calendar/Announcer";
import { useDisplay } from "@/components/shell/DisplayProvider";
import { Avatar } from "@/components/ui/Avatar";
import { demoNoInviteText } from "@/lib/chat/people";
import type { DraftDto } from "@/lib/chat/types";
import { postJson } from "@/lib/client/post-json";
import { fmtDateShort, fmtRange } from "@/lib/time/display";
import { localDateOf, localTimeOf } from "@/lib/time/zoned";

type Props = {
  draft: DraftDto;
  timeZone: string;
  /** Whether a change of the draft is being saved (then nothing can be taken off). */
  working: boolean;
  setWorking: (working: boolean) => void;
  onRefusal: (message: string) => void;
  onEdited?: (draft: DraftDto) => void;
};

export function DraftPeople({ draft, timeZone, working, setWorking, onRefusal, onEdited }: Props) {
  const { timeFormat } = useDisplay();
  const announce = useAnnounce();
  const open = draft.status === "open";
  const withPeople = draft.events.map((event, index) => ({ event, index })).filter(({ event }) => event.people && event.people.length > 0);
  if (withPeople.length === 0) return null;

  async function takeOff(index: number, person: string, name: string) {
    if (working) return;
    setWorking(true);
    onRefusal("");
    const answer = await postJson(`/api/chat/drafts/${draft.id}/people`, { version: draft.version ?? 0, index, person });
    setWorking(false);
    if (!answer.ok) {
      onRefusal(answer.message);
      return;
    }
    const edited = (answer.data as { draft?: DraftDto | null } | undefined)?.draft;
    if (edited) onEdited?.(edited);
    announce(`${name} taken off.`);
  }

  return (
    <section aria-label="Invited people" className="border-b border-line-subtle p-3" data-draft-people>
      <h3 className="mb-2 text-sm font-semibold tracking-snug text-ink">Invited</h3>
      <ul className="flex flex-col gap-3">
        {withPeople.map(({ event, index }) => {
          const start = new Date(event.startAt);
          const end = new Date(event.endAt);
          const when = `${fmtDateShort(localDateOf(start, timeZone))}, ${fmtRange(localTimeOf(start, timeZone), localTimeOf(end, timeZone), timeFormat)}`;
          const demos = event.people!.filter((p) => p.demo);
          return (
            <li key={index} className="min-w-0">
              <p className="flex items-baseline gap-2">
                <span className="min-w-0 truncate text-[13px] font-medium text-ink">{event.title}</span>
                <span className="shrink-0 text-[11px] tabular text-ink-3">{when}</span>
              </p>
              <ul aria-label={`Invited to ${event.title}`} className="mt-1.5 flex flex-wrap gap-1.5">
                {event.people!.map((person) => (
                  <li key={person.key} className="flex items-center gap-1.5 rounded-full bg-raised py-0.5 pl-0.5 pr-2 text-xs text-ink-2">
                    <Avatar name={person.name} photoUrl={person.photoUrl} look={person.demo} size={24} />
                    <span className={person.gone ? "italic text-ink-3" : ""}>{person.name}</span>
                    {person.demo && <span className="rounded bg-surface px-1 text-[10px] font-medium text-ink-3">Demo</span>}
                    {open && (
                      <button
                        type="button"
                        disabled={working}
                        aria-label={`Take ${person.name} off ${event.title}`}
                        onClick={() => void takeOff(index, person.key, person.name)}
                        className="ml-0.5 rounded-full px-1 text-ink-3 hover:bg-surface hover:text-ink disabled:opacity-50"
                      >
                        ×
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {demos.map((person) => (
                <p key={person.key} className="mt-1 text-[11px] text-ink-3">
                  {demoNoInviteText(person.name)}.
                </p>
              ))}
            </li>
          );
        })}
      </ul>
      {open && <p className="mt-2 text-[11px] text-ink-3">Applying the draft invites them: they see the event in their calendar and answer it.</p>}
    </section>
  );
}
