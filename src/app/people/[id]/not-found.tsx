import Link from "next/link";

// Someone the user may not see, a missing user and a malformed address look the same (R43).
export default function PersonNotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-5 text-center">
      <h1 className="text-xl font-semibold text-ink">Not found</h1>
      <p className="text-sm text-ink-2">This profile does not exist or is not shared with you.</p>
      <Link href="/people" className="text-sm font-medium text-ink underline underline-offset-2">
        Back to People
      </Link>
    </main>
  );
}
