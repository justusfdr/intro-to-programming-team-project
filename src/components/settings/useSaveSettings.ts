"use client";

// Saves one change of the settings at once (as in the prototype: no Save button). The server checks
// every value (update_settings). The card shows the new value at once and the page re-reads in the
// background (components/live/Live.tsx); on a rejection the card goes back to the saved value and
// shows the message.
import { useState } from "react";
import { useAnnounce } from "@/components/calendar/Announcer";
import { useLive } from "@/components/live/Live";
import { postJson, type PostResult } from "@/lib/client/post-json";
import type { SettingsData } from "@/lib/settings/types";

export function useSaveSettings() {
  const live = useLive();
  const announce = useAnnounce();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<PostResult | null>(null);

  async function save(patch: Partial<SettingsData>): Promise<boolean> {
    setBusy(true);
    setFailure(null);
    const answer = await live.run({
      send: () => postJson("/api/settings", patch),
      optimistic: { settings: (settings) => ({ ...settings, ...patch }) },
      // The answer holds the whole row as saved (for example the time zone's canonical name).
      fromAnswer: (a) => {
        const saved = (a.data as { settings?: SettingsData } | undefined)?.settings;
        return saved ? { settings: () => saved } : null;
      },
    });
    setBusy(false);
    setFailure(answer.ok ? null : answer);
    if (!answer.ok) return false;
    announce(answer.message);
    return true;
  }

  return { save, busy, failure };
}
