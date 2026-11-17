"use client";

// The coach's chats (spec 44): the list next to the conversation, grouped by the day of each chat's
// latest message ("Today", "Yesterday", "Mon, Nov 16"), newest first, and "New chat" at the bottom.
// A chat is a link to /coach?chat=<id>; "New chat" is /coach?chat=new, an empty chat that starts with its
// first message. On wide screens the list stands beside the conversation; on phones it opens from the header.
// Above the list a search field finds chats by the words in their messages (GET /api/chat/search): the
// results replace the days while something is typed, each with an excerpt, and open the chat at the
// message that matched.
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Search, SquarePen } from "lucide-react";
import { chatDayLabel, chatDays } from "@/lib/chat/chats";
import { hitParts, searchWords } from "@/lib/chat/search";
import type { ChatSummaryDto } from "@/lib/chat/types";
import { getJson } from "@/lib/client/post-json";
import { localDateOf } from "@/lib/time/zoned";

/** One chat the search found, as the server sends it. */
export type ChatSearchResultDto = { chat: ChatSummaryDto; messageId: string | null; excerpt: string | null };

/** Wait this long after the last key before searching. */
const SEARCH_DELAY_MS = 250;

type Props = {
  chats: ChatSummaryDto[];
  /** The chat on the screen; null for a new chat. */
  currentId: string | null;
  timeZone: string;
  /** Now, as the page knows it (the days are worked out from it). */
  now: Date;
  /** Called when a chat or "New chat" is chosen (the phone's list closes then). */
  onPick?: () => void;
};

/** The text with the searched words marked. */
function Marked({ text, words }: { text: string; words: string[] }) {
  return (
    <>
      {hitParts(text, words).map((part, i) =>
        part.hit ? (
          <mark key={i} className="rounded-[3px] bg-amber-100 px-px text-ink">
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}

/** The search's results: the chats found, newest first, each with its day and an excerpt. */
export function ChatSearchResults({
  results,
  words,
  currentId,
  timeZone,
  now,
  onPick,
}: {
  results: ChatSearchResultDto[];
  words: string[];
  currentId: string | null;
  timeZone: string;
  now: Date;
  onPick?: () => void;
}) {
  if (results.length === 0) return <p className="px-2 pt-1 text-[13px] leading-5 text-ink-3">No chats contain these words.</p>;
  const today = localDateOf(now, timeZone);
  return (
    <ul aria-label="Search results" className="flex flex-col gap-0.5">
      {results.map(({ chat, messageId, excerpt }) => {
        const on = chat.id === currentId;
        return (
          <li key={chat.id}>
            <Link
              href={`/coach?chat=${chat.id}${messageId ? `&message=${messageId}` : ""}`}
              aria-current={on ? "page" : undefined}
              onClick={onPick}
              className={`block rounded-lg px-2 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 ${
                on ? "bg-raised" : "hover:bg-raised"
              }`}
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[13px] font-medium leading-5 text-ink">
                  <Marked text={chat.title} words={words} />
                </span>
                <span className="shrink-0 text-[11px] text-ink-3">{chatDayLabel(localDateOf(new Date(chat.updatedAt), timeZone), today)}</span>
              </span>
              {excerpt && (
                <span className="mt-0.5 line-clamp-2 block text-[12px] leading-[17px] text-ink-2">
                  <Marked text={excerpt} words={words} />
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function ChatList({ chats, currentId, timeZone, now, onPick }: Props) {
  const days = chatDays(chats, now, timeZone);
  // The list is on the page twice (beside the conversation, and in the phone's dialog).
  const uid = useId();

  const [query, setQuery] = useState("");
  // What the server answered, with the search it answered, so an older answer never shows for a newer search.
  const [answer, setAnswer] = useState<{ q: string; results: ChatSearchResultDto[] | null; error: string } | null>(null);
  const latest = useRef("");
  const q = query.trim();
  const words = searchWords(q) ?? [];

  useEffect(() => {
    latest.current = q;
    if (q === "") return;
    const timer = window.setTimeout(async () => {
      const found = await getJson(`/api/chat/search?q=${encodeURIComponent(q)}`);
      if (latest.current !== q) return;
      const results = found.ok ? ((found.data as { results?: ChatSearchResultDto[] }).results ?? []) : null;
      setAnswer({ q, results, error: found.ok ? "" : found.message });
    }, SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [q]);

  const searching = q !== "";
  const shown = answer && answer.q === q ? answer : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-14 shrink-0 items-center px-4">
        <h2 className="text-[13px] font-semibold text-ink-2">Chats</h2>
      </div>
      <div className="shrink-0 px-2 pb-2">
        <label htmlFor={`${uid}-search`} className="sr-only">
          Search chats
        </label>
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" strokeWidth={2} />
          <input
            id={`${uid}-search`}
            type="search"
            value={query}
            maxLength={100}
            placeholder="Search chats"
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              // Escape empties the search first (in the phone's list, a second Escape closes it).
              if (event.key === "Escape" && query !== "") {
                event.preventDefault();
                event.stopPropagation();
                setQuery("");
              }
            }}
            className="h-8 w-full rounded-full border border-line-subtle bg-surface pl-8 pr-3 text-[13px] text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-ink/30"
          />
        </div>
      </div>
      <nav aria-label={searching ? "Chats found" : "Chats by day"} className="scroll-thin relative min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {searching ? (
          <div aria-live="polite">
            {shown === null ? (
              <p className="px-2 pt-1 text-[13px] leading-5 text-ink-3">Searching…</p>
            ) : shown.results === null ? (
              <p role="alert" className="px-2 pt-1 text-[13px] leading-5 text-danger">
                {shown.error}
              </p>
            ) : (
              <ChatSearchResults results={shown.results} words={words} currentId={currentId} timeZone={timeZone} now={now} onPick={onPick} />
            )}
          </div>
        ) : days.length === 0 ? (
          <p className="px-2 pt-1 text-[13px] leading-5 text-ink-3">Your chats show up here, by day.</p>
        ) : (
          days.map((day) => (
            <section key={day.day} aria-labelledby={`${uid}-${day.day}`} className="mb-3">
              <h3 id={`${uid}-${day.day}`} className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                {day.label}
              </h3>
              <ul className="flex flex-col gap-0.5">
                {day.chats.map((chat) => {
                  const on = chat.id === currentId;
                  return (
                    <li key={chat.id}>
                      <Link
                        href={`/coach?chat=${chat.id}`}
                        aria-current={on ? "page" : undefined}
                        onClick={onPick}
                        className={`block truncate rounded-lg px-2 py-1.5 text-[13px] leading-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 ${
                          on ? "bg-raised font-medium text-ink" : "text-ink-2 hover:bg-raised hover:text-ink"
                        }`}
                      >
                        {chat.title}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </nav>
      <div className="shrink-0 border-t border-line-subtle p-2">
        <Link
          href="/coach?chat=new"
          onClick={onPick}
          aria-current={currentId === null ? "page" : undefined}
          className="flex h-10 items-center justify-center gap-2 rounded-full bg-ink px-4 text-[13px] font-semibold text-white transition-colors hover:bg-ink/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:ring-offset-2"
        >
          <SquarePen className="size-4" strokeWidth={2} />
          New chat
        </Link>
      </div>
    </div>
  );
}
