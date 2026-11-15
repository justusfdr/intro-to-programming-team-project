import Link from "next/link";

// A list the user may not use, a missing one and a malformed address look the same (R55).
export default function ListNotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-5 text-center">
      <h1 className="text-xl font-semibold text-ink">Not found</h1>
      <p className="text-sm text-ink-2">This list does not exist or is not shared with you.</p>
      <Link href="/lists" className="text-sm font-medium text-ink underline underline-offset-2">
        Back to your lists
      </Link>
    </main>
  );
}
