// The small "Demo" tag next to a demo contact's name (spec 32), so nobody takes them for a real person.
export function DemoTag({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full border border-line px-1.5 text-[10px] font-medium uppercase leading-[16px] tracking-[0.06em] text-ink-3 ${className}`}>
      Demo
    </span>
  );
}
