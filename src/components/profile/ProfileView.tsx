"use client";

// The user's own profile page (spec 31): at the top the photo (or initials), the shown name and the
// e-mail address, with "Sign out" at the top right. Below, in the look of the settings cards: the photo
// (change, remove; a chosen picture is placed in the "Position your photo" dialog first, ./PhotoDialog.tsx),
// the display name, a one-line bio, the LinkedIn link, and the time zone from the
// settings with the local time there. The three fields save together with one Save button that appears
// when something changed (the pattern of the event editor, spec 17); a refusal shows at its field. The
// server checks everything again; the browser's checks only spare a round trip.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { Eye, UserRound, Users } from "lucide-react";
import { FormMessage } from "@/components/account/FormMessage";
import { SignOutButton } from "@/components/account/SignOutButton";
import { useAnnounce } from "@/components/calendar/Announcer";
import { INPUT_CLASS, SettingsCardHeader } from "@/components/settings/fields";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { postJson } from "@/lib/client/post-json";
import { encodePhoto, loadPicture, looksLikePicture, PhotoTooLargeError, PhotoUnreadableError, type Picture } from "@/lib/client/resize-photo";
import type { SourceRect } from "@/lib/profiles/crop";
import { MAX_DISPLAY_NAME, shownName } from "@/lib/profiles/display-name";
import {
  cleanProfile,
  draftOf,
  MAX_BIO,
  profileChanged,
  type ProfileDraft,
  type ProfileField,
  type SavedProfileFields,
} from "@/lib/profiles/profile-fields";
import type { ProfileCardData } from "@/lib/profiles/types";
import { TimeZoneLine } from "./parts";
import { PhotoDialog } from "./PhotoDialog";

/** Who sees the profile (R43), said once on the page. */
export const WHO_SEES = "Your contacts and people you invite see your name, photo, bio, LinkedIn link and time zone.";

/** The server's code of a refusal → the field it belongs to. */
const FIELD_OF: Record<string, ProfileField> = { invalid_name: "displayName", invalid_bio: "bio", invalid_linkedin: "linkedin" };

type Errors = Partial<Record<ProfileField, string>>;

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint: ReactNode;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm text-ink">
        {label}
      </label>
      {children}
      <p id={`${id}-hint`} className="text-xs text-ink-3">
        {hint}
      </p>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function ProfileView({ profile, now }: { profile: ProfileCardData; now: string }) {
  const router = useRouter();
  const announce = useAnnounce();
  const uid = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [saved, setSaved] = useState<SavedProfileFields>({
    displayName: profile.displayName,
    bio: profile.bio,
    linkedinUrl: profile.linkedinUrl,
  });
  const [draft, setDraft] = useState<ProfileDraft>(() => draftOf(saved));
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  // The picture being placed in the dialog (read once, shown from a local address), and the dialog's error.
  const [placing, setPlacing] = useState<{ picture: Picture; url: string } | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const changeButton = useRef<HTMLButtonElement>(null);

  // The local address and the read picture are freed when the dialog closes (and when the page goes).
  useEffect(() => {
    if (!placing) return;
    return () => {
      URL.revokeObjectURL(placing.url);
      placing.picture.close();
    };
  }, [placing]);

  const changed = profileChanged(saved, draft);
  const fallback = shownName(null, profile.email);
  const shown = shownName(saved.displayName, profile.email);

  function edit(field: ProfileField, value: string) {
    setDraft((d) => ({ ...d, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  }

  function discard() {
    setDraft(draftOf(saved));
    setErrors({});
    setFormError(null);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const clean = cleanProfile(draft, saved.displayName);
    if (!clean.ok) {
      setErrors({ [clean.field]: clean.message });
      return;
    }
    setBusy(true);
    const answer = await postJson("/api/profile", draft);
    setBusy(false);
    if (!answer.ok) {
      const code = (answer.data as { error?: unknown } | undefined)?.error;
      const field = typeof code === "string" ? FIELD_OF[code] : undefined;
      if (field) setErrors({ [field]: answer.message });
      else setFormError(answer.message);
      return;
    }
    const next = (answer.data as { profile?: SavedProfileFields } | undefined)?.profile ?? {
      displayName: clean.displayName ?? saved.displayName,
      bio: clean.bio,
      linkedinUrl: clean.linkedinUrl,
    };
    setSaved(next);
    // The fields show what was saved (a pasted link in its one stored form).
    setDraft(draftOf(next));
    setErrors({});
    announce(answer.message);
    router.refresh();
  }

  async function photoAction(path: string, body: unknown) {
    setBusy(true);
    setPhotoError(null);
    const answer = await postJson(path, body);
    setBusy(false);
    if (!answer.ok) {
      setPhotoError(answer.message);
      return;
    }
    announce(answer.message);
    router.refresh();
  }

  /** A picture was chosen: read it (anything that is not a picture is refused here), then place it. */
  async function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // The same file can be chosen again later.
    event.target.value = "";
    if (!file) return;
    setPhotoError(null);
    const refused = new PhotoUnreadableError().message;
    if (!looksLikePicture(file)) return setPhotoError(refused);
    setBusy(true);
    try {
      const picture = await loadPicture(file);
      setDialogError(null);
      setPlacing({ picture, url: URL.createObjectURL(file) });
    } catch (problem) {
      setPhotoError(problem instanceof PhotoUnreadableError ? problem.message : refused);
    } finally {
      setBusy(false);
    }
  }

  function closeDialog() {
    setPlacing(null);
    setDialogError(null);
    changeButton.current?.focus({ preventScroll: true });
  }

  /** "Use photo": cut the placed square, encode it and upload it; a refusal stays in the dialog. */
  async function applyPhoto(source: SourceRect) {
    if (!placing) return;
    setBusy(true);
    setDialogError(null);
    let data: string;
    try {
      data = await encodePhoto(placing.picture, source);
    } catch (problem) {
      setBusy(false);
      setDialogError(problem instanceof PhotoUnreadableError || problem instanceof PhotoTooLargeError ? problem.message : new PhotoUnreadableError().message);
      return;
    }
    const answer = await postJson("/api/profile/photo", { data });
    setBusy(false);
    if (!answer.ok) {
      setDialogError(answer.message);
      return;
    }
    closeDialog();
    announce(answer.message);
    router.refresh();
  }

  const described = (id: string, field: ProfileField) => (errors[field] ? `${id}-hint ${id}-error` : `${id}-hint`);
  const nameId = `${uid}-name`;
  const bioId = `${uid}-bio`;
  const linkId = `${uid}-linkedin`;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-6 md:px-8 md:py-8">
      <header className="flex max-w-3xl flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar name={shown} photoUrl={profile.photoUrl} size={64} label={profile.photoUrl ? "Your photo" : `Your initials, ${shown}`} />
          <div className="min-w-0">
            <h1 className="truncate text-[28px] leading-[34px] font-semibold tracking-heading text-ink">{shown}</h1>
            <p className="truncate text-sm text-ink-3">{profile.email}</p>
          </div>
        </div>
        <SignOutButton look="button" />
      </header>

      <div className="flex max-w-3xl flex-col gap-4">
        <Card role="region" aria-labelledby={`${uid}-title`} className="p-5 md:p-6">
          <SettingsCardHeader
            icon={UserRound}
            title="Profile"
            titleId={`${uid}-title`}
            description={
              <span className="inline-flex items-start gap-1.5">
                <Eye className="mt-0.5 size-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />
                {WHO_SEES}
              </span>
            }
          />

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <p className="w-full text-sm text-ink sm:w-auto sm:min-w-24">Photo</p>
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={choosePhoto}
            />
            <Button ref={changeButton} variant="secondary" size="sm" disabled={busy} onClick={() => fileInput.current?.click()}>
              Change photo
            </Button>
            {profile.photoUrl && (
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => void photoAction("/api/profile/photo/remove", {})}>
                Remove
              </Button>
            )}
            {profile.photoUrl && <p className="w-full text-xs text-ink-3 sm:ml-[6.75rem]">Choose the photo again to move it.</p>}
          </div>
          <div aria-live="polite">{photoError && <FormMessage tone="error" text={photoError} />}</div>
          <PhotoDialog
            picture={placing ? { url: placing.url, width: placing.picture.width, height: placing.picture.height } : null}
            busy={busy}
            error={dialogError}
            onCancel={closeDialog}
            onUse={(source) => void applyPhoto(source)}
          />

          <form onSubmit={save} noValidate className="mt-5 flex flex-col gap-4">
            <Field id={nameId} label="Display name" error={errors.displayName} hint={<>1 to {MAX_DISPLAY_NAME} characters. Until you set one, people see &quot;{fallback}&quot;.</>}>
              <input
                id={nameId}
                name="displayName"
                type="text"
                value={draft.displayName}
                onChange={(e) => edit("displayName", e.target.value)}
                maxLength={MAX_DISPLAY_NAME * 2}
                autoComplete="nickname"
                placeholder={fallback}
                aria-invalid={errors.displayName ? true : undefined}
                aria-describedby={described(nameId, "displayName")}
                className={`${INPUT_CLASS} w-full`}
              />
            </Field>

            <Field id={bioId} label="Bio" error={errors.bio} hint={<>Optional. Up to {MAX_BIO} characters, one line.</>}>
              <input
                id={bioId}
                name="bio"
                type="text"
                value={draft.bio}
                onChange={(e) => edit("bio", e.target.value)}
                maxLength={MAX_BIO * 2}
                placeholder="Studying statistics at Nova, in Lisbon until June"
                aria-invalid={errors.bio ? true : undefined}
                aria-describedby={described(bioId, "bio")}
                className={`${INPUT_CLASS} w-full`}
              />
            </Field>

            <Field id={linkId} label="LinkedIn" error={errors.linkedin} hint="Optional. The link to your LinkedIn profile.">
              <input
                id={linkId}
                name="linkedin"
                type="text"
                inputMode="url"
                autoComplete="url"
                spellCheck={false}
                value={draft.linkedin}
                onChange={(e) => edit("linkedin", e.target.value)}
                maxLength={300}
                placeholder="https://www.linkedin.com/in/your-name"
                aria-invalid={errors.linkedin ? true : undefined}
                aria-describedby={described(linkId, "linkedin")}
                className={`${INPUT_CLASS} w-full`}
              />
            </Field>

            <TimeZoneLine timeZone={profile.timeZone} now={now} settingsLink />

            <div aria-live="polite">{formError && <FormMessage tone="error" text={formError} />}</div>

            {changed && (
              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line-subtle pt-4">
                <Button variant="ghost" disabled={busy} onClick={discard}>
                  Discard
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy ? "Saving…" : "Save"}
                </Button>
              </div>
            )}
          </form>

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
      </div>
    </div>
  );
}
