import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountCard } from "@/components/account/AccountCard";
import { signedInRedirect } from "@/lib/route-guard";
import { pageDeps } from "@/lib/server/deps";
import { SignUpForm } from "./SignUpForm";

export const metadata: Metadata = { title: "Create your account" };

export default async function SignUpPage() {
  // Someone who is already signed in has no use for this form.
  const target = signedInRedirect(await (await pageDeps()).auth.currentUserId());
  if (target) redirect(target);
  return (
    <AccountCard
      title="Create your account"
      footer={
        <>
          Already have an account?{" "}
          <Link href="/sign-in" className="font-medium text-ink underline underline-offset-2">
            Sign in
          </Link>
        </>
      }
    >
      <SignUpForm />
    </AccountCard>
  );
}
