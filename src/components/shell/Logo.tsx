import { APP_NAME } from "@/lib/app-name";

/** The app's mark (a black tile with a dot and a ring) and its name. */
export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <span aria-hidden className="relative flex size-7 items-center justify-center rounded-[9px] bg-ink">
        <span className="size-2.5 rounded-full bg-white" />
        <span className="absolute size-[18px] rounded-full border border-white/35" />
      </span>
      <span className="text-[15px] font-semibold tracking-snug text-ink">{APP_NAME}</span>
    </span>
  );
}
