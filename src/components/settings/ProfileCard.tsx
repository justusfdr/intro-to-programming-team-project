"use client";

// Card "Profile" at the top of Settings (spec 28): the photo (or the initials) with "Change photo" and
// "Remove", the display name with Save, and the e-mail address, read only. Only the user and their
// contacts see the name and photo, and people the user has invited (R43). The browser crops and scales
// a chosen picture before sending it (src/lib/client/resize-photo.ts); the server checks everything.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { UserRound, Users } from "lucide-react";
import { FormMessage } from "@/components/account/FormMessage";
import { useAnnounce } from "@/components/calendar/Announcer";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { postJson } from "@/lib/client/post-json";
import { preparePhoto, PhotoUnreadableError } from "@/lib/client/resize-photo";
import { MAX_DISPLAY_NAME, shownName } from "@/lib/profiles/display-name";
import type { OwnProfile } from "@/lib/profiles/types";
import { INPUT_CLASS, SettingsCardHeader } from "./fields";

export function ProfileCard({ profile }: { profile: OwnProfile }) {
  const router = useRouter();
  const announce = useAnnounce();
  const uid = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(profile.displayName ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function done(path: string, body: unknown): Promise<boolean> {
    setBusy(true);
    setError(null);
    const answer = await postJson(path, body);
    setBusy(false);
    if (!answer.ok) {
      setError(answer.message);
      return false;
    }
    announce(answer.message);
    router.refresh();
    return true;
  }

  function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void done("/api/profile/name", { displayName: name });
  }

  async function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // The same file can be chosen again later.
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setError(null);
    let data: string;
    try {
      data = await preparePhoto(file);
    } catch (problem) {
      setBusy(false);
      setError(problem instanceof PhotoUnreadableError ? problem.message : "This picture cannot be read.");
      return;
    }
    await done("/api/profile/photo", { data });
  }

  const saved = profile.displayName ?? "";
  const shown = shownName(name.trim() || null, profile.email);

  return (
    <Card role="region" aria-labelledby={`${uid}-title`} className="p-5 md:p-6">
      <SettingsCardHeader
        icon={UserRound}
        title="Profile"
        titleId={`${uid}-title`}
        description="Your name and photo. Only you, your contacts and people you invite see them."
      />

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <Avatar name={shown} photoUrl={profile.photoUrl} size={64} label={profile.photoUrl ? "Your photo" : `Your initials, ${shown}`} />
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={choosePhoto}
          />
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => fileInput.current?.click()}>
            Change photo
          </Button>
          {profile.photoUrl && (
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => void done("/api/profile/photo/remove", {})}>
              Remove
            </Button>
          )}
        </div>
      </div>

      <form onSubmit={saveName} noValidate className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <label htmlFor={`${uid}-name`} className="text-sm text-ink">
            Display name
          </label>
          <input
            id={`${uid}-name`}
            name="displayName"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={MAX_DISPLAY_NAME * 2}
            autoComplete="nickname"
            placeholder={shownName(null, profile.email)}
            aria-describedby={`${uid}-name-hint`}
            className={`${INPUT_CLASS} w-full`}
          />
          <p id={`${uid}-name-hint`} className="text-xs text-ink-3">
            1 to {MAX_DISPLAY_NAME} characters. Until you set one, people see &quot;{shownName(null, profile.email)}&quot;.
          </p>
        </div>
        <Button type="submit" variant="secondary" disabled={busy || name.trim() === saved || name.trim() === ""} className="sm:mb-5">
          Save
        </Button>
      </form>

      <div className="mt-3 flex flex-col gap-1.5">
        <label htmlFor={`${uid}-email`} className="text-sm text-ink">
          E-mail address
        </label>
        <input id={`${uid}-email`} type="email" value={profile.email} readOnly className={`${INPUT_CLASS} w-full bg-raised text-ink-2`} />
      </div>

      <div aria-live="polite">{error && <FormMessage tone="error" text={error} />}</div>

      <p className="mt-5 flex items-center gap-1.5 border-t border-line-subtle pt-4 text-sm text-ink-2">
        <Users className="size-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />
        <span>
          Contacts and invitations are on the{" "}
          <Link href="/people" className="font-medium text-ink underline underline-offset-2">
            People
          </Link>{" "}
          page.
        </span>
      </p>
    </Card>
  );
}
