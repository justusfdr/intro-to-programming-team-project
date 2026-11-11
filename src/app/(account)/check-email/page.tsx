import type { Metadata } from "next";
import Link from "next/link";
import { AccountCard } from "@/components/account/AccountCard";
import { ResendForm } from "./ResendForm";

export const metadata: Metadata = { title: "Check your email" };

// Shown after sign-up, and linked from the confirmation page when a link has expired.
export default function CheckEmailPage() {
  return (
    <AccountCard
      title="Check your email"
      footer={
        <>
          Already confirmed?{" "}
          <Link href="/sign-in" className="font-medium text-ink underline underline-offset-2">
            Sign in
          </Link>
        </>
      }
    >
      <p className="text-sm text-ink-2">Open the link in the e-mail we sent you.</p>
      <ResendForm />
    </AccountCard>
  );
}
