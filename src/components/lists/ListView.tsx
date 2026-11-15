"use client";

// One shared list (spec 30): the title (the owner can rename it), the people's avatars, "Share" for
// the owner (their contacts with Add and Remove) or "Leave list" for a member, the entries with round
// tick rings as in the goals column, rename in place, arrows to move, delete, "Add an entry" at the
// bottom, done entries dimmed at the end with "Hide done" (remembered in this browser). Small avatars
// show who added an open entry and who ticked a done one.
//
// The server decides everything and answers with the list as it is now, which replaces what is on
// screen. A tick shows at once and goes back with the server's message if it is refused. Changes by
// other people arrive by re-reading the page on focus and every 20 seconds while it is visible.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowLeft, Check, ChevronDown, ChevronUp, Eye, EyeOff, LogOut, Pencil, Plus, Share2, Trash2 } from "lucide-react";
import { FormMessage } from "@/components/account/FormMessage";
import { useAnnounce } from "@/components/calendar/Announcer";
import { useLive } from "@/components/live/Live";
import { INPUT_CLASS } from "@/components/settings/fields";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { postJson } from "@/lib/client/post-json";
import { shownOrder, stepTarget, movedTo } from "@/lib/lists/order";
import { MAX_ENTRY_TITLE, MAX_LIST_TITLE, type ListDetail, type ListEntry, type ListPageData, type ListPerson, type ShareContact } from "@/lib/lists/types";
import { PeopleStack } from "./People";
import { useHideDone, useRefreshWhileVisible } from "./refresh";
import { SharePanel } from "./SharePanel";

const ICON_BUTTON =
  "grid size-7 shrink-0 place-items-center rounded-md text-ink-3 transition-colors hover:bg-raised hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 disabled:pointer-events-none disabled:opacity-30";

export function ListView({ data }: { data: ListPageData }) {
  const live = useLive();
  const router = useRouter();
  const announce = useAnnounce();
  // What is on screen: the page's data, replaced by each accepted answer and by each re-read.
  const [list, setList] = useState<ListDetail>(data.list);
  const [seen, setSeen] = useState<ListDetail>(data.list);
  if (data.list !== seen) {
    setSeen(data.list);
    setList(data.list);
  }
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [hideDone, setHideDone] = useHideDone();
  const shareId = useId();
  useRefreshWhileVisible(live.refresh);

  /** Sends one action. `optimistic` is shown at once and taken back if the server refuses. */
  async function send(path: string, body: unknown, optimistic?: (current: ListDetail) => ListDetail): Promise<boolean> {
    const before = list;
    if (optimistic) setList(optimistic(list));
    setError(null);
    setBusy(true);
    const answer = await postJson(path, body);
    setBusy(false);
    if (!answer.ok) {
      setList(before);
      setError(answer.message);
      // Someone else changed it first: fetch the latest version in the background.
      if (answer.status === 409 || answer.status === 404) live.refresh();
      return false;
    }
    announce(answer.message);
    const next = (answer.data as { list?: ListDetail } | undefined)?.list;
    if (next) setList(next);
    if (answer.next) router.push(answer.next);
    return true;
  }

  const byId = new Map(list.people.map((p) => [p.userId, p]));
  const shared = list.people.length > 1;
  const entries = shownOrder(list.entries);
  const shown = hideDone ? entries.filter((e) => !e.done) : entries;
  const doneCount = list.entries.filter((e) => e.done).length;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-5 py-6 md:px-8 md:py-8">
      <Link href="/lists" className="inline-flex w-fit items-center gap-1.5 rounded-md text-sm text-ink-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30">
        <ArrowLeft className="size-4" strokeWidth={1.8} aria-hidden="true" />
        All lists
      </Link>

      <ListTitle list={list} busy={busy} onRename={(title) => send(`/api/lists/${list.id}/rename`, { title, updatedAt: list.updatedAt })} />

      <div className="flex flex-wrap items-center gap-2">
        <PeopleStack people={list.people} max={8} />
        <span className="text-xs text-ink-3">{shared ? `${list.people.length} people` : "Only you"}</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {list.isOwner ? (
            <>
              <Button
                size="sm"
                variant="secondary"
                aria-expanded={shareOpen}
                aria-controls={shareOpen ? shareId : undefined}
                onClick={() => setShareOpen((open) => !open)}
              >
                <Share2 className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
                Share
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(true)} disabled={busy}>
                <Trash2 className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
                Delete list
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setConfirming(true)} disabled={busy}>
              <LogOut className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
              Leave list
            </Button>
          )}
        </div>
      </div>

      {confirming && (
        <div role="group" aria-label={list.isOwner ? "Delete this list" : "Leave this list"} className="flex flex-wrap items-center gap-2 rounded-xl bg-raised px-3 py-2">
          <span className="text-sm text-ink-2">
            {list.isOwner
              ? shared
                ? "Delete this list and its entries for everyone?"
                : "Delete this list and its entries?"
              : "Leave this list? You will no longer see it."}
          </span>
          <Button
            size="sm"
            variant="danger"
            disabled={busy}
            autoFocus
            onClick={async () => {
              if (await send(`/api/lists/${list.id}/${list.isOwner ? "delete" : "leave"}`, {})) setConfirming(false);
            }}
          >
            {list.isOwner ? "Delete" : "Leave"}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </div>
      )}

      {list.isOwner && shareOpen && (
        <SharePanel
          id={shareId}
          contacts={data.contacts}
          people={list.people}
          busy={busy}
          onAdd={(contact: ShareContact) => void send(`/api/lists/${list.id}/members/add`, { contactId: contact.contactId })}
          onRemove={(userId) => void send(`/api/lists/${list.id}/members/remove`, { userId })}
        />
      )}

      <div aria-live="polite">{error && <FormMessage tone="error" text={error} />}</div>

      <Card className="p-4 md:p-5">
        <div className="flex items-center gap-2">
          <h2 className="min-w-0 flex-1 text-[15px] font-semibold tracking-snug text-ink">Entries</h2>
          {doneCount > 0 && (
            <button
              type="button"
              aria-pressed={hideDone}
              onClick={() => setHideDone(!hideDone)}
              className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-ink-2 transition-colors hover:bg-raised hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
            >
              {hideDone ? <Eye className="size-3.5" aria-hidden="true" /> : <EyeOff className="size-3.5" aria-hidden="true" />}
              {hideDone ? `Show done (${doneCount})` : "Hide done"}
            </button>
          )}
        </div>
        {list.entries.length === 0 && <p className="mt-2 text-sm text-ink-3">Nothing on this list yet.</p>}
        <ul aria-label={`Entries of ${list.title}`} className="mt-2 flex flex-col">
          {shown.map((entry) => (
            <EntryRow
              key={entry.id}
              entry={entry}
              shared={shared}
              byId={byId}
              up={stepTarget(list.entries, entry.id, -1)}
              down={stepTarget(list.entries, entry.id, 1)}
              onTick={() =>
                void send(`/api/list-entries/${entry.id}/done`, { done: !entry.done, updatedAt: entry.updatedAt }, (current) => ({
                  ...current,
                  entries: current.entries.map((e) => (e.id === entry.id ? { ...e, done: !e.done, doneBy: e.done ? null : (current.people.find((p) => p.isMe)?.userId ?? null) } : e)),
                }))
              }
              onRename={(title) => send(`/api/list-entries/${entry.id}/rename`, { title, updatedAt: entry.updatedAt })}
              onMove={(to) =>
                void send(`/api/list-entries/${entry.id}/move`, { toIndex: to, updatedAt: entry.updatedAt }, (current) => ({
                  ...current,
                  entries: movedTo(current.entries, entry.id, to),
                }))
              }
              onDelete={() =>
                void send(`/api/list-entries/${entry.id}/delete`, { updatedAt: entry.updatedAt }, (current) => ({
                  ...current,
                  entries: current.entries.filter((e) => e.id !== entry.id),
                }))
              }
            />
          ))}
        </ul>
        <AddEntry listTitle={list.title} onAdd={(title) => send(`/api/lists/${list.id}/entries`, { title })} />
      </Card>
    </div>
  );
}

/** The list's title; the owner can rename it in place. */
function ListTitle({ list, busy, onRename }: { list: ListDetail; busy: boolean; onRename: (title: string) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(list.title);
  const owner = list.people.find((p) => p.isOwner);
  if (editing) {
    return (
      <form
        aria-label="Rename the list"
        onSubmit={async (event) => {
          event.preventDefault();
          if (await onRename(title)) setEditing(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            setEditing(false);
          }
        }}
        className="flex flex-wrap items-center gap-2"
      >
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          aria-label="List title"
          maxLength={MAX_LIST_TITLE * 2}
          autoFocus
          className={`${INPUT_CLASS} min-w-0 flex-1 text-base md:text-sm`}
        />
        <Button type="submit" size="sm" disabled={busy}>
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </form>
    );
  }
  return (
    <header className="flex flex-wrap items-end gap-2">
      <div className="min-w-0">
        <h1 className="break-words text-[28px] leading-[34px] font-semibold tracking-heading text-ink">{list.title}</h1>
        <p className="mt-1 text-sm text-ink-2">{list.isOwner ? "Your list" : `A list by ${owner?.name ?? "someone"}`}</p>
      </div>
      {list.isOwner && (
        <button
          type="button"
          aria-label="Rename the list"
          title="Rename the list"
          onClick={() => {
            setTitle(list.title);
            setEditing(true);
          }}
          className={`${ICON_BUTTON} mb-1`}
        >
          <Pencil className="size-3.5" strokeWidth={1.8} />
        </button>
      )}
    </header>
  );
}

type RowProps = {
  entry: ListEntry;
  shared: boolean;
  byId: Map<string, ListPerson>;
  up: number | null;
  down: number | null;
  onTick: () => void;
  onRename: (title: string) => Promise<boolean>;
  onMove: (to: number) => void;
  onDelete: () => void;
};

/** One entry: the tick ring, the title (click to rename), who added or ticked it, arrows and delete. */
function EntryRow({ entry, shared, byId, up, down, onTick, onRename, onMove, onDelete }: RowProps) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(entry.title);
  const saving = useRef(false);
  const who = entry.done ? (entry.doneBy ? byId.get(entry.doneBy) : undefined) : entry.addedBy ? byId.get(entry.addedBy) : undefined;
  const whoLabel = who ? `${entry.done ? "Ticked by" : "Added by"} ${who.isMe ? "you" : who.name}` : null;

  async function save() {
    if (saving.current) return;
    if (title.trim() === entry.title) {
      setEditing(false);
      return;
    }
    saving.current = true;
    const ok = await onRename(title);
    saving.current = false;
    if (ok) setEditing(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setTitle(entry.title);
      setEditing(false);
    }
  }

  return (
    <li className={`flex min-h-9 items-center gap-2.5 text-[14px] ${entry.done ? "opacity-60" : ""}`}>
      <button
        type="button"
        aria-label={entry.done ? `Untick '${entry.title}'` : `Tick '${entry.title}'`}
        aria-pressed={entry.done}
        title={entry.done ? "Untick" : "Tick"}
        onClick={onTick}
        className="relative shrink-0 rounded-full before:absolute before:-inset-2 before:content-[''] hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:ring-offset-1"
      >
        {entry.done ? (
          <span aria-hidden className="flex size-[18px] items-center justify-center rounded-full bg-ink-3 text-white">
            <Check className="size-3" strokeWidth={3} />
          </span>
        ) : (
          <span aria-hidden className="block size-[18px] rounded-full border-[1.5px] border-ink-3" />
        )}
      </button>
      {editing ? (
        <form
          className="min-w-0 flex-1"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            void save();
          }}
        >
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => void save()}
            onKeyDown={onKeyDown}
            aria-label={`Rename '${entry.title}'`}
            maxLength={MAX_ENTRY_TITLE * 2}
            autoFocus
            enterKeyHint="done"
            className="block h-8 w-full min-w-0 rounded-md border border-line bg-surface px-2 text-sm text-ink focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/10"
          />
        </form>
      ) : (
        <button
          type="button"
          onClick={() => {
            setTitle(entry.title);
            setEditing(true);
          }}
          aria-label={`Rename '${entry.title}'`}
          className={`min-w-0 flex-1 truncate rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 ${entry.done ? "text-ink-3 line-through" : "text-ink"}`}
        >
          {entry.title}
        </button>
      )}
      {shared && who && whoLabel && <Avatar name={who.name} photoUrl={who.photoUrl} size={24} label={whoLabel} />}
      <span className="flex shrink-0 items-center">
        <button type="button" className={ICON_BUTTON} disabled={up === null} onClick={() => up !== null && onMove(up)} aria-label={`Move '${entry.title}' up`} title="Move up">
          <ChevronUp className="size-4" strokeWidth={1.8} />
        </button>
        <button type="button" className={ICON_BUTTON} disabled={down === null} onClick={() => down !== null && onMove(down)} aria-label={`Move '${entry.title}' down`} title="Move down">
          <ChevronDown className="size-4" strokeWidth={1.8} />
        </button>
        <button type="button" className={ICON_BUTTON} onClick={onDelete} aria-label={`Delete '${entry.title}'`} title="Delete">
          <Trash2 className="size-3.5" strokeWidth={1.8} />
        </button>
      </span>
    </li>
  );
}

/** "Add an entry" at the bottom: Enter saves and the field stays, like a list you type into. */
function AddEntry({ listTitle, onAdd }: { listTitle: string; onAdd: (title: string) => Promise<boolean> }) {
  const inputId = useId();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        const ok = await onAdd(title);
        setBusy(false);
        if (ok) setTitle("");
      }}
      className="mt-2 flex items-center gap-2.5"
    >
      <Plus className="size-[18px] shrink-0 p-[2px] text-ink-3" aria-hidden="true" />
      <label htmlFor={inputId} className="sr-only">
        Add an entry to {listTitle}
      </label>
      <input
        id={inputId}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Add an entry"
        autoComplete="off"
        maxLength={MAX_ENTRY_TITLE * 2}
        enterKeyHint="done"
        className="h-9 min-w-0 flex-1 rounded-md bg-transparent px-2 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
      />
      <Button type="submit" size="sm" variant="secondary" disabled={busy || title.trim() === ""}>
        Add
      </Button>
    </form>
  );
}
