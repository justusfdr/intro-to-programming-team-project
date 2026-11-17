"use client";

// The coach (spec 19, step B): a familiar chat layout. Spec 44: the chats, grouped by day, in a list
// left of the conversation (on phones it opens from the header), with "New chat" at its bottom. The
// conversation in a centred column, the composer at the bottom (on phones above the tab bar), a slim
// top row with "Delete chat". The server is the judge: this screen only sends the text and shows what
// the server saved. A refused message disappears again (nothing was saved, R1), its text goes back
// into the field, and the server's sentence shows above the field. The assistant's text is plain text.
// A new chat starts with its first message: the server makes it, and the address then names it.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { PanelLeft, SquarePen } from "lucide-react";
import { useAnnounce } from "@/components/calendar/Announcer";
import { LogoMark } from "@/components/shell/Logo";
import { Button } from "@/components/ui/Button";
import type { ChatMessageDto, ChatPageData, ChatSummaryDto, DraftDto, DraftStatus } from "@/lib/chat/types";
import { postJson } from "@/lib/client/post-json";
import { MESSAGES } from "@/lib/messages";
import { ChatList } from "./ChatList";
import { Composer } from "./Composer";
import { DraftCard } from "./DraftCard";

export const NOT_SET_UP = "The coach is not set up on this server yet.";
const SLOW_MS = 15_000;

/** Starter chips: they fill the field, they do not send. */
export const STARTERS = [
  "Tomorrow I want to study 4 hours, go for a run and watch football in the evening.",
  "Plan my Saturday: a long run in the morning, groceries, and time with friends at night.",
  "How much time did I spend on my goals last week?",
  "Find two hours for deep work every morning this week.",
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
  /** Previews only: text already in the field, and the "Delete chat" question open. */
  defaultText?: string;
  defaultConfirmingDelete?: boolean;
  /** Spec 43: the field takes the focus when the page opens (with `defaultText` from a goal's "Plan with coach"). */
  focusField?: boolean;
  /** Spec 44: a message the search found: the conversation opens at it and marks it for a moment. */
  focusMessageId?: string | null;
};

export function CoachView({ data, defaultText = "", defaultConfirmingDelete = false, focusField = false, focusMessageId = null }: Props) {
  const router = useRouter();
  const announce = useAnnounce();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const chatsDialog = useRef<HTMLDialogElement>(null);

  // The page's data, with what this screen learned since (the answer to a send, a changed draft).
  // A new read of the page (router.refresh) replaces it.
  const [shown, setShown] = useState(data);
  const [messages, setMessages] = useState<ChatMessageDto[]>(data.messages);
  const [chats, setChats] = useState<ChatSummaryDto[]>(data.chats);
  const [chatId, setChatId] = useState(data.chatId);
  const [text, setText] = useState(defaultText);
  const [pending, setPending] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState("");
  const [live, setLive] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(defaultConfirmingDelete);
  const [deleting, setDeleting] = useState(false);
  const [chatsOpen, setChatsOpen] = useState(false);

  if (shown !== data) {
    setShown(data);
    setMessages(data.messages);
    setChats(data.chats);
    // Spec 44: the page names another chat (picked in the list, "New chat", after a delete): it starts
    // fresh. After the first answer of a new chat the page names the chat this screen already shows,
    // so nothing is reset and the field keeps its focus and text.
    if (data.chatId !== chatId) {
      setChatId(data.chatId);
      setText(defaultText);
      setPending(null);
      setSlow(false);
      setError("");
      setLive("");
      setConfirmingDelete(false);
      setChatsOpen(false);
    }
  }

  // The chat on the screen, for answers that arrive after the person moved to another chat.
  const shownChat = useRef(chatId);
  useEffect(() => {
    shownChat.current = chatId;
  }, [chatId]);

  // The calendar's events around a draft belong to the open draft the page was read with.
  const loadedOpenDraft = data.messages.find((m) => m.draft?.status === "open")?.draft?.id ?? null;

  const notice = !data.chatAllowed ? MESSAGES.chatProOnly : !data.assistantConfigured ? NOT_SET_UP : "";
  const disabled = notice !== "";
  // The server's time when the page was read (without it, as in previews: the newest chat's day is today).
  const now = new Date(data.now ?? chats[0]?.updatedAt ?? 0);
  const title = chats.find((c) => c.id === chatId)?.title ?? (chatId === null ? "New chat" : "");

  // The page opens at the end; new messages scroll into view. Spec 44: opened from a search, the chat
  // opens at the message found instead (once; the next message scrolls to the end again).
  const seen = useRef(false);
  const focused = useRef<string | null>(null);
  useEffect(() => {
    if (focusMessageId && focused.current !== focusMessageId) {
      const found = document.getElementById(`message-${focusMessageId}`);
      if (found) {
        found.scrollIntoView({ block: "center", behavior: "auto" });
        focused.current = focusMessageId;
        seen.current = true;
        return;
      }
    }
    endRef.current?.scrollIntoView({ block: "end", behavior: seen.current ? "smooth" : "auto" });
    seen.current = true;
  }, [messages.length, pending, chatId, focusMessageId]);

  // Spec 43: opened from a goal, the field has the focus with the cursor after the sentence. Nothing is sent.
  useEffect(() => {
    if (!focusField) return;
    const field = inputRef.current;
    if (!field || field.disabled) return;
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
  }, [focusField]);

  // "Still working" after 15 seconds of waiting.
  useEffect(() => {
    if (pending === null) return;
    const id = window.setTimeout(() => {
      setSlow(true);
      setLive("Still working. This can take up to a minute.");
    }, SLOW_MS);
    return () => window.clearTimeout(id);
  }, [pending]);

  // Phones: the list of chats as a native dialog (Escape and a click on the backdrop close it).
  useEffect(() => {
    const dialog = chatsDialog.current;
    if (!dialog) return;
    if (chatsOpen && !dialog.open) dialog.showModal();
    if (!chatsOpen && dialog.open) dialog.close();
  }, [chatsOpen]);

  // The phone's list closes when the screen grows wide (it is hidden there, but would still block the page).
  useEffect(() => {
    const wide = window.matchMedia?.("(min-width: 768px)");
    if (!wide) return;
    const close = () => wide.matches && setChatsOpen(false);
    wide.addEventListener("change", close);
    return () => wide.removeEventListener("change", close);
  }, []);

  async function send() {
    const sent = text;
    const from = chatId;
    if (disabled || pending !== null || !sent.trim()) return;
    setError("");
    setSlow(false);
    setPending(sent);
    setText("");
    setLive("Planning…");
    const answer = await postJson("/api/chat/messages", { text: sent, chatId: from ?? "new" });
    if (shownChat.current !== from) {
      // The person moved to another chat meanwhile: leave it as it is; the list learns of the answer.
      router.refresh();
      return;
    }
    setPending(null);
    if (!answer.ok) {
      // Nothing was saved: the message goes back into the field, the server's sentence above it.
      setText((typed) => (typed.trim() ? `${sent}\n${typed}` : sent));
      setError(answer.message);
      setLive("");
      // The chat was deleted on another device: the text stays, and sending it again starts a new chat.
      if ((answer.data as { error?: string } | undefined)?.error === "chat_gone") {
        setChatId(null);
        router.replace("/coach?chat=new", { scroll: false });
      }
      return;
    }
    const saved = answer.data as { chat: ChatSummaryDto; messages: ChatMessageDto[] };
    const newDraft = saved.messages.some((m) => m.draft !== null);
    setMessages((current) => [
      // A draft answer turns an older open draft "replaced" on the server.
      ...(newDraft ? current.map((m) => (m.draft?.status === "open" ? { ...m, draft: { ...m.draft, status: "replaced" as const } } : m)) : current),
      ...saved.messages,
    ]);
    setChats((current) => [saved.chat, ...current.filter((c) => c.id !== saved.chat.id)]);
    setLive("The coach answered.");
    if (chatId === null) {
      // The first message started the chat: the address names it from now on.
      setChatId(saved.chat.id);
      router.replace(`/coach?chat=${saved.chat.id}`, { scroll: false });
    } else {
      // Read the page again: a new draft is drawn between the calendar's events of its days.
      router.refresh();
    }
  }

  function draftChanged(draftId: string, status: DraftStatus) {
    setMessages((current) => current.map((m) => (m.draft?.id === draftId ? { ...m, draft: { ...m.draft, status } } : m)));
  }

  // Spec 22: the person dragged a block of the open draft and the server saved it.
  function draftEdited(draft: DraftDto) {
    setMessages((current) => current.map((m) => (m.draft?.id === draft.id ? { ...m, draft } : m)));
  }

  async function deleteChat() {
    const from = chatId;
    if (from === null) return;
    setDeleting(true);
    const answer = await postJson(`/api/chat/chats/${from}/delete`, {});
    setDeleting(false);
    if (shownChat.current !== from) {
      router.refresh();
      return;
    }
    if (!answer.ok) {
      setError(answer.message);
      return;
    }
    setConfirmingDelete(false);
    setError("");
    announce(answer.message);
    router.replace("/coach?chat=new", { scroll: false });
  }

  function fillStarter(starter: string) {
    setText(starter);
    inputRef.current?.focus();
  }

  const empty = messages.length === 0 && pending === null;
  const list = (onPick?: () => void) => <ChatList chats={chats} currentId={chatId} timeZone={data.timeZone} now={now} onPick={onPick} />;

  return (
    // The page itself never scrolls (spec 44): only the list of chats and the conversation do.
    <div className="flex h-[calc(100dvh-7rem)] overflow-hidden md:h-dvh">
      {/* Wide screens: the chats beside the conversation. */}
      <aside aria-label="Chats" className="hidden w-[244px] shrink-0 border-r border-line-subtle bg-canvas md:block">
        {list()}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="shrink-0 border-b border-line-subtle bg-canvas/90 backdrop-blur-xl">
          <div className="mx-auto flex h-14 max-w-[720px] items-center justify-between gap-3 px-4">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                aria-label="Show chats"
                aria-haspopup="dialog"
                aria-expanded={chatsOpen}
                onClick={() => setChatsOpen(true)}
                className="-ml-2 flex size-9 shrink-0 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-raised hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 md:hidden"
              >
                <PanelLeft className="size-[18px]" strokeWidth={1.8} />
              </button>
              <h1 className="shrink-0 text-[17px] font-semibold tracking-snug text-ink">Coach</h1>
              {title && <p className="min-w-0 truncate text-xs text-ink-3">{title}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {chatId !== null &&
                (confirmingDelete ? (
                  <div role="group" aria-label="Delete this chat?" className="flex shrink-0 items-center gap-1.5">
                    <span className="hidden text-xs text-ink-2 sm:inline">Delete this chat?</span>
                    <Button size="sm" variant="danger" disabled={deleting} onClick={() => void deleteChat()}>
                      Delete
                    </Button>
                    <Button size="sm" variant="ghost" disabled={deleting} onClick={() => setConfirmingDelete(false)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => setConfirmingDelete(true)}>
                    Delete chat
                  </Button>
                ))}
              {chatId !== null && !confirmingDelete && (
                <Link
                  href="/coach?chat=new"
                  aria-label="New chat"
                  className="flex size-9 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-raised hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 md:hidden"
                >
                  <SquarePen className="size-[18px]" strokeWidth={1.8} />
                </Link>
              )}
            </div>
          </div>
        </header>

        {/* `relative`: the texts only screen readers hear are absolutely placed; without a positioned
            parent they would stick out below the conversation and make the whole page scroll. */}
        <div className="scroll-thin relative min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[720px] px-4 pb-6 pt-6">
            {empty ? (
              <div className="flex min-h-[50dvh] flex-col items-center justify-center text-center">
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
                    <li key={m.id} id={`message-${m.id}`} className={`flex justify-end ${m.id === focusMessageId ? "search-hit" : ""}`}>
                      <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-[20px] bg-raised px-4 py-2.5 text-[15px] leading-6 text-ink">
                        <span className="sr-only">You: </span>
                        {m.text}
                      </p>
                    </li>
                  ) : (
                    <li key={m.id} id={`message-${m.id}`} className={`flex gap-3 ${m.id === focusMessageId ? "search-hit" : ""}`}>
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
        </div>

        <p role="status" className="sr-only">
          {live}
        </p>

        <div className="shrink-0">
          <div className="mx-auto max-w-[720px] px-4 pb-2 md:pb-4">
            {error && (
              <p role="alert" className="mb-2 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}
            {notice && (
              <p className="mb-2 rounded-xl border border-line-subtle bg-raised px-3 py-2 text-sm text-ink-2">
                {notice}
                {/* Spec 24: a Free user sees where to get Pro. */}
                {!data.chatAllowed && (
                  <>
                    {" "}
                    <Link href="/pricing" className="font-semibold text-ink underline underline-offset-2">
                      See plans
                    </Link>
                  </>
                )}
              </p>
            )}
            <Composer
              value={text}
              onChange={setText}
              onSend={() => void send()}
              disabled={disabled}
              sending={pending !== null}
              onVoiceError={setError}
              inputRef={inputRef}
              chatKey={chatId ?? "new"}
            />
          </div>
        </div>
      </div>

      {/* Phones: the chats open from the header. */}
      <dialog
        ref={chatsDialog}
        aria-label="Chats"
        onClose={() => setChatsOpen(false)}
        onClick={(event) => event.target === chatsDialog.current && setChatsOpen(false)}
        className="m-0 h-dvh max-h-none w-[min(84vw,320px)] max-w-none bg-canvas p-0 text-ink shadow-pop md:hidden"
      >
        {chatsOpen && list(() => setChatsOpen(false))}
      </dialog>
    </div>
  );
}
