// The people of a list as a row of overlapping avatars (spec 30): the owner first, at most `max`, then
// "+3". Screen readers get the names in one sentence instead of the pictures.
import { Avatar } from "@/components/ui/Avatar";
import type { ListPerson } from "@/lib/lists/types";

/** "Lea (owner), you and Ben" */
export function peopleSentence(people: readonly ListPerson[]): string {
  const names = people.map((p) => (p.isMe ? "you" : p.isOwner ? `${p.name} (owner)` : p.name));
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function PeopleStack({ people, max = 5 }: { people: readonly ListPerson[]; max?: number }) {
  const shown = people.slice(0, max);
  const more = people.length - shown.length;
  return (
    <span className="flex items-center">
      <span className="sr-only">Shared by {peopleSentence(people)}</span>
      <span aria-hidden="true" className="flex items-center">
        {shown.map((person, i) => (
          <Avatar
            key={person.userId}
            name={person.name}
            photoUrl={person.photoUrl}
            size={24}
            className={`ring-2 ring-surface ${i > 0 ? "-ml-1.5" : ""}`}
          />
        ))}
        {more > 0 && (
          <span className="-ml-1.5 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-raised px-1 text-[10px] font-semibold text-ink-2 ring-2 ring-surface">
            +{more}
          </span>
        )}
      </span>
    </span>
  );
}
