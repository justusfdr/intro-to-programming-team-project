"use client";

// The coach (spec 19, step B): a familiar chat layout. The conversation in a centred column, the
// composer fixed at the bottom (on phones above the tab bar), a slim top row with the messages left
// today and "Clear chat". The server is the judge: this screen only sends the text and shows what the
// server saved. A refused message disappears again (nothing was saved, R1), its text goes back into
// the field, and the server's sentence shows above the field. The assistant's text is plain text.
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAnnounce } from "@/components/calendar/Announcer";
import { LogoMark } from "@/components/shell/Logo";
import { Button } from "@/components/ui/Button";
import { DAILY_MESSAGES } from "@/lib/chat/access";
import type { ChatMessageDto, ChatPageData, DraftDto, DraftStatus } from "@/lib/chat/types";
import { postJson } from "@/lib/client/post-json";
import { MESSAGES } from "@/lib/messages";
import { Composer } from "./Composer";
import { DraftCard } from "./DraftCard";

export const NOT_SET_UP = "The coach is not set up on this server yet.";
const SLOW_MS = 15_000;

/** Starter chips: they fill the field, they do not send. */
export const STARTERS = [
  "Tomorrow I want to study 4 hours, go for a run and watch football in the evening.",
  "Plan my Saturday: a long run in the morning, groceries, and time with friends at night.",
  "How much time did I spend on my goals last week?",
  "Plane meinen Tag morgen: 4 Stunden lernen, abends Fußball schauen",
];

function CoachMark() {
  return <LogoMark className="mt-0.5 size-7 rounded-full" />;
}

function Waiting({ slow }: { slow: boolean }) {
  return (
    <li aria-hidden className="flex gap-3">
      <CoachMark />
      <div className="flex items-center gap-2 pt-1.5 text-sm text-ink-3">
        <span>{slow ? "Still working. This can take up to a minute." : "Planning…"}</span>
        <span className="flex gap-1">
          {[0, 150, 300].map((delay) => (
            <span key={delay} className="size-1.5 rounded-full bg-ink-3 motion-safe:animate-pulse" style={{ animationDelay: `${delay}ms` }} />
          ))}
        </span>
      </div>
    </li>
  );
}

type Props = {
  data: ChatPageData;
  /** Previews only: text already in the field, and the "Clear chat" question open. */
  defaultText?: string;
  defaultConfirmingClear?: boolean;
};

export function CoachView({ data, defaultText = "", defaultConfirmingClear = false }: Props) {
  const router = useRouter();
  const announce = useAnnounce();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // The page's data, with what this screen learned since (the answer to a send, a changed draft).
  // A new read of the page (router.refresh) replaces it.
  const [shown, setShown] = useState(data);
  const [messages, setMessages] = useState<ChatMessageDto[]>(data.messages);
  const [left, setLeft] = useState(data.messagesLeft);
  if (shown !== data) {
    setShown(data);
    setMessages(data.messages);
    setLeft(data.messagesLeft);
  }

  const [text, setText] = useState(defaultText);
  const [pending, setPending] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState("");
  const [live, setLive] = useState("");
  const [confirmingClear, setConfirmingClear] = useState(defaultConfirmingClear);
  const [clearing, setClearing] = useState(false);
  const [bottomSpace, setBottomSpace] = useState(160);

  // The calendar's events around a draft belong to the open draft the page was read with.
  const loadedOpenDraft = data.messages.find((m) => m.draft?.status === "open")?.draft?.id ?? null;

  const notice = !data.chatAllowed
    ? MESSAGES.chatProOnly
    : !data.assistantConfigured
      ? NOT_SET_UP
      : left <= 0
        ? MESSAGES.chatLimit
        : "";
  const disabled = notice !== "";

  // The page opens at the end; new messages scroll into view.
  const seen = useRef(false);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: seen.current ? "smooth" : "auto" });
    seen.current = true;
  }, [messages.length, pending]);

  // "Still working" after 15 seconds of waiting.
  useEffect(() => {
    if (pending === null) return;
    const id = window.setTimeout(() => {
      setSlow(true);
      setLive("Still working. This can take up to a minute.");
    }, SLOW_MS);
    return () => window.clearTimeout(id);
  }, [pending]);

  // Room under the conversation for the fixed composer, however tall it grows.
  useEffect(() => {
    const bottom = bottomRef.current;
    if (!bottom || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setBottomSpace(bottom.offsetHeight + 24));
    observer.observe(bottom);
    return () => observer.disconnect();
  }, []);

  async function send() {
    const sent = text;
    if (disabled || pending !== null || !sent.trim()) return;
    setError("");
    setSlow(false);
    setPending(sent);
    setText("");
    setLive("Planning…");
    const answer = await postJson("/api/chat/messages", { text: sent });
    setPending(null);
    if (!answer.ok) {
      // Nothing was saved: the message goes back into the field, the server's sentence above it.
      setText((typed) => (typed.trim() ? `${sent}\n${typed}` : sent));
      setError(answer.message);
      setLive("");
      // A message that reached the assistant still counts (R1's exception): read the counter again.
      router.refresh();
      return;
    }
    const saved = answer.data as { messages: ChatMessageDto[]; messagesLeft: number };
    const newDraft = saved.messages.some((m) => m.draft !== null);
    setMessages((current) => [
      // A draft answer turns an older open draft "replaced" on the server.
      ...(newDraft ? current.map((m) => (m.draft?.status === "open" ? { ...m, draft: { ...m.draft, status: "replaced" as const } } : m)) : current),
      ...saved.messages,
    ]);
    setLeft(saved.messagesLeft);
    setLive("The coach answered.");
    // Read the page again: a new draft is drawn between the calendar's events of its days.
    router.refresh();
  }

  function draftChanged(draftId: string, status: DraftStatus) {
    setMessages((current) => current.map((m) => (m.draft?.id === draftId ? { ...m, draft: { ...m.draft, status } } : m)));
  }

  // Spec 22: the person dragged a block of the open draft and the server saved it.
  function draftEdited(draft: DraftDto) {
    setMessages((current) => current.map((m) => (m.draft?.id === draft.id ? { ...m, draft } : m)));
  }

  async function clear() {
    setClearing(true);
    const answer = await postJson("/api/chat/clear", {});
    setClearing(false);
    if (!answer.ok) {
      setError(answer.message);
      return;
    }
    setConfirmingClear(false);
    setMessages([]);
    setError("");
    announce(answer.message);
    router.refresh();
  }

  function fillStarter(starter: string) {
    setText(starter);
    inputRef.current?.focus();
  }

  const empty = messages.length === 0 && pending === null;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-line-subtle bg-canvas/90 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[720px] items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-baseline gap-3">
            <h1 className="text-[17px] font-semibold tracking-snug text-ink">Coach</h1>
            {data.chatAllowed && data.assistantConfigured && (
              <p className="truncate text-xs text-ink-3 tabular">{`${left} of ${DAILY_MESSAGES} messages left today`}</p>
            )}
          </div>
          {messages.length > 0 &&
            (confirmingClear ? (
              <div role="group" aria-label="Clear chat?" className="flex shrink-0 items-center gap-1.5">
                <span className="hidden text-xs text-ink-2 sm:inline">Delete all messages?</span>
                <Button size="sm" variant="danger" disabled={clearing} onClick={() => void clear()}>
                  Clear
                </Button>
                <Button size="sm" variant="ghost" disabled={clearing} onClick={() => setConfirmingClear(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setConfirmingClear(true)}>
                Clear chat
              </Button>
            ))}
        </div>
      </header>

      <div className="mx-auto w-full max-w-[720px] flex-1 px-4 pt-6" style={{ paddingBottom: bottomSpace }}>
        {empty ? (
          <div className="flex min-h-[55dvh] flex-col items-center justify-center text-center">
            <LogoMark className="size-11 rounded-[14px]" />
            <h2 className="mt-4 text-[22px] font-semibold tracking-heading text-ink">What should tomorrow look like?</h2>
            <p className="mt-2 max-w-md text-sm text-ink-2">
              Tell me in your own words, typed or spoken. I draft your day; nothing changes until you add it.
            </p>
            {!disabled && (
              <ul aria-label="Ideas to start with" className="mt-6 grid w-full max-w-xl gap-2 sm:grid-cols-2">
                {STARTERS.map((starter) => (
                  <li key={starter}>
                    <button
                      type="button"
                      onClick={() => fillStarter(starter)}
                      className="h-full w-full rounded-card border border-line-subtle bg-surface px-3.5 py-2.5 text-left text-[13px] leading-5 text-ink-2 transition-colors hover:border-line hover:bg-raised hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
                    >
                      {starter}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <ol aria-label="Conversation" className="flex flex-col gap-6">
            {messages.map((m) =>
              m.role === "user" ? (
                <li key={m.id} className="flex justify-end">
                  <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-[20px] bg-raised px-4 py-2.5 text-[15px] leading-6 text-ink">
                    <span className="sr-only">You: </span>
                    {m.text}
                  </p>
                </li>
              ) : (
                <li key={m.id} className="flex gap-3">
                  <CoachMark />
                  <div className="min-w-0 flex-1">
                    <p className="whitespace-pre-wrap break-words pt-0.5 text-[15px] leading-6 text-ink">
                      <span className="sr-only">Coach: </span>
                      {m.text}
                    </p>
                    {m.draft && (
                      <DraftCard
                        draft={m.draft}
                        goals={data.goals}
                        timeZone={data.timeZone}
                        calendar={m.draft.id === loadedOpenDraft ? data.draftDayEvents : []}
                        onStatus={draftChanged}
                        onEdited={draftEdited}
                      />
                    )}
                  </div>
                </li>
              ),
            )}
            {pending !== null && (
              <>
                <li className="flex justify-end">
                  <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-[20px] bg-raised px-4 py-2.5 text-[15px] leading-6 text-ink">
                    <span className="sr-only">You: </span>
                    {pending}
                  </p>
                </li>
                <Waiting slow={slow} />
              </>
            )}
          </ol>
        )}
        <div ref={endRef} />
      </div>

      <p role="status" className="sr-only">
        {live}
      </p>

      <div
        ref={bottomRef}
        className="fixed inset-x-0 bottom-[calc(max(16px,env(safe-area-inset-bottom))+64px)] z-30 bg-gradient-to-t from-canvas from-70% to-transparent pt-6 md:bottom-0 md:left-[232px]"
      >
        <div className="mx-auto max-w-[720px] px-4 pb-2 md:pb-4">
          {error && (
            <p role="alert" className="mb-2 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
          {notice && (
            <p className="mb-2 rounded-xl border border-line-subtle bg-raised px-3 py-2 text-sm text-ink-2">{notice}</p>
          )}
          <Composer
            value={text}
            onChange={setText}
            onSend={() => void send()}
            disabled={disabled}
            sending={pending !== null}
            onVoiceError={setError}
            inputRef={inputRef}
          />
        </div>
      </div>
    </div>
  );
}
