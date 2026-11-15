"use client";

// The lists overview (spec 30): "New list", then the user's lists, their own and those shared with
// them ("by Lea"), each with the number of open entries and the people's avatars. In the calm look of
// the People page. The server decides everything; this sends the input and shows the answer.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { ListChecks, Plus } from "lucide-react";
import { FormMessage } from "@/components/account/FormMessage";
import { useAnnounce } from "@/components/calendar/Announcer";
import { useLive } from "@/components/live/Live";
import { INPUT_CLASS } from "@/components/settings/fields";
import { Button } from "@/components/ui/Button";
import { Card, PageHeader } from "@/components/ui/Card";
import { postJson } from "@/lib/client/post-json";
import { MAX_LIST_TITLE, type ListSummary } from "@/lib/lists/types";
import { PeopleStack } from "./People";
import { useRefreshWhileVisible } from "./refresh";

export const EMPTY_LISTS = "No lists yet. Start one for yourself, or share it with your contacts.";

export function ListsView({ lists }: { lists: ListSummary[] }) {
  const router = useRouter();
  const live = useLive();
  const announce = useAnnounce();
  const inputId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useRefreshWhileVisible(live.refresh);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const title = String(new FormData(form).get("title") ?? "");
    setBusy(true);
    setError(null);
    const answer = await postJson("/api/lists", { title });
    setBusy(false);
    if (!answer.ok) {
      setError(answer.message);
      return;
    }
    announce(answer.message);
    form.reset();
    if (answer.next) router.push(answer.next);
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-6 md:px-8 md:py-8">
      <PageHeader title="Lists" subtitle="To-do lists of your own, and lists your contacts share with you. Your goals and tasks stay private." />
      <div className="flex max-w-3xl flex-col gap-4">
        <form onSubmit={create} noValidate className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label htmlFor={inputId} className="sr-only">
            Title of the new list
          </label>
          <input
            id={inputId}
            name="title"
            autoComplete="off"
            maxLength={MAX_LIST_TITLE * 2}
            placeholder="New list, e.g. Flat shopping"
            className={`${INPUT_CLASS} min-w-0 flex-1 text-base md:text-sm`}
          />
          <Button type="submit" variant="primary" disabled={busy} className="shrink-0">
            <Plus className="size-4" strokeWidth={1.8} aria-hidden="true" />
            New list
          </Button>
        </form>
        <div aria-live="polite">{error && <FormMessage tone="error" text={error} />}</div>

        {lists.length === 0 ? (
          <p className="text-sm text-ink-3">{EMPTY_LISTS}</p>
        ) : (
          <ul aria-label="Your lists" className="flex flex-col gap-2">
            {lists.map((list) => (
              <li key={list.id}>
                <Card className="transition-colors hover:bg-raised/40">
                  <Link
                    href={`/lists/${list.id}`}
                    className="flex items-center gap-3 rounded-card px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
                  >
                    <ListChecks className="size-[18px] shrink-0 text-ink-3" strokeWidth={1.8} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{list.title}</span>
                      <span className="block truncate text-xs text-ink-3">
                        {list.isOwner ? "Yours" : `by ${list.ownerName}`} · {list.openCount} open
                      </span>
                    </span>
                    {list.people.length > 1 && <PeopleStack people={list.people} />}
                  </Link>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
