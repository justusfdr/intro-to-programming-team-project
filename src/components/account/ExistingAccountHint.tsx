import Link from "next/link";

// Issue #200: sign-up answers "We sent you a link" for a new and for a taken address alike (spec 50), so
// nobody learns which e-mails have an account. The owner of a taken address gets no mail; this line tells
// everyone, in the same words, what to do then. It reveals nothing about the address.
const link = "font-medium text-ink underline underline-offset-2";

export function ExistingAccountHint({ className = "" }: { className?: string }) {
  return (
    <p className={`text-sm text-ink-2 ${className}`}>
      Already have an account? No new mail is sent then.{" "}
      <Link href="/sign-in" className={link}>
        Sign in
      </Link>{" "}
      or{" "}
      <Link href="/forgot-password" className={link}>
        reset your password
      </Link>
      .
    </p>
  );
}
