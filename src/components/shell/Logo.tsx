import { APP_NAME } from "@/lib/app-name";

/** The app's mark alone: a black tile with a dot and a ring. Decorative. */
export function LogoMark({ className = "size-7 rounded-[9px]" }: { className?: string }) {
  return (
    <span aria-hidden className={`relative flex shrink-0 items-center justify-center bg-ink ${className}`}>
      <span className="size-[36%] rounded-full bg-white" />
      <span className="absolute size-[64%] rounded-full border border-white/35" />
    </span>
  );
}

/** The app's mark and its name. */
export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <LogoMark />
      <span className="text-[15px] font-semibold tracking-snug text-ink">{APP_NAME}</span>
    </span>
  );
}
