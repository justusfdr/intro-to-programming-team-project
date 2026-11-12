"use client";

// Saves one change of the settings at once (as in the prototype: no Save button). The server checks
// every value (update_settings); on success the page reloads its data, on a rejection the card shows
// the message and the saved value stays.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAnnounce } from "@/components/calendar/Announcer";
import { postJson, type PostResult } from "@/lib/client/post-json";
import type { SettingsData } from "@/lib/settings/types";

export function useSaveSettings() {
  const router = useRouter();
  const announce = useAnnounce();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<PostResult | null>(null);

  async function save(patch: Partial<SettingsData>): Promise<boolean> {
    setBusy(true);
    const answer = await postJson("/api/settings", patch);
    setBusy(false);
    setFailure(answer.ok ? null : answer);
    if (!answer.ok) return false;
    announce(answer.message);
    router.refresh();
    return true;
  }

  return { save, busy, failure };
}
