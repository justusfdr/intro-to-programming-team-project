// The coach's chats (spec 44): a chat's title, and the chats grouped by the day of their latest
// message for the list next to the conversation. No browser and no database needed here.
import type { ChatSummaryDto } from "@/lib/chat/types";
import { fmtDateShort } from "@/lib/time/display";
import { addDays, localDateOf, type LocalDate } from "@/lib/time/zoned";

/** A chat's title is at most this long; the database checks the same (app.chats). */
export const CHAT_TITLE_MAX = 80;

/**
 * A chat's title from its first message: on one line (runs of white space as one space), trimmed,
 * cut to 80 characters; "Chat" when nothing is left. The same as app.chat_title in the database.
 */
export function chatTitleOf(text: string): string {
  // By characters, not UTF-16 units, so an emoji is never cut in half (the database counts the same way).
  const title = Array.from(text.replace(/\s+/g, " ").trim()).slice(0, CHAT_TITLE_MAX).join("").trim();
  return title === "" ? "Chat" : title;
}

export type ChatDay = { day: LocalDate; label: string; chats: ChatSummaryDto[] };

/** "Today", "Yesterday", else the short date ("Mon, Nov 16"). */
export function chatDayLabel(day: LocalDate, today: LocalDate): string {
  if (day === today) return "Today";
  if (day === addDays(today, -1)) return "Yesterday";
  return fmtDateShort(day);
}

/**
 * The chats grouped by the local day of their latest message, newest day first; inside a day the
 * newest chat first. A chat dated after today (another device's clock) counts as today.
 */
export function chatDays(chats: readonly ChatSummaryDto[], now: Date, timeZone: string): ChatDay[] {
  const today = localDateOf(now, timeZone);
  const byDay = new Map<LocalDate, ChatSummaryDto[]>();
  const sorted = [...chats].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
  for (const chat of sorted) {
    const local = localDateOf(new Date(chat.updatedAt), timeZone);
    const day = local > today ? today : local;
    const list = byDay.get(day);
    if (list) list.push(chat);
    else byDay.set(day, [chat]);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([day, list]) => ({ day, label: chatDayLabel(day, today), chats: list }));
}
