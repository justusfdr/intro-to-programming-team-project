// A user's photo, or a circle with their initials when there is none (spec 40). Sizes: 16 next to a
// shared calendar's events (spec 53), 24 in the sidebar, 32 in the row "Your profile" in Settings, 64 at
// the top of the profile page and on the People page's cards.
//
// The photo comes from our own route (/api/profiles/[id]/photo), which answers only for the people R43
// names (the user, their contacts, the people they have an open invitation from). The picture is decorative next to the name, so it has no text of its own
// unless `label` is given (an avatar shown without the name next to it).
import { initialsOf } from "@/lib/profiles/display-name";

export type AvatarSize = 16 | 24 | 32 | 64;

const TEXT: Record<AvatarSize, string> = { 16: "text-[7px]", 24: "text-[10px]", 32: "text-xs", 64: "text-xl" };

export function Avatar({
  name,
  photoUrl,
  size = 32,
  label,
  className = "",
}: {
  /** The shown name: its initials stand in for a missing photo. */
  name: string;
  photoUrl: string | null;
  size?: AvatarSize;
  /** Text for screen readers when the name is not written next to the avatar. */
  label?: string;
  className?: string;
}) {
  const box = { width: size, height: size };
  if (photoUrl) {
    return (
      // A plain <img>: the photo is already 256 x 256 and must not go through the image optimizer,
      // which would fetch it without the viewer's session.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt={label ?? ""}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        referrerPolicy="same-origin"
        style={box}
        className={`shrink-0 rounded-full bg-raised object-cover ${className}`}
      />
    );
  }
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={box}
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full bg-muted font-semibold text-ink-2 ${TEXT[size]} ${className}`}
    >
      {initialsOf(name)}
    </span>
  );
}
