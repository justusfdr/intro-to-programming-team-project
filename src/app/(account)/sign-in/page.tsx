import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountCard } from "@/components/account/AccountCard";
import { signedInRedirect } from "@/lib/route-guard";
import { pageDeps } from "@/lib/server/deps";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage() {
  // Someone who is already signed in has no use for this form.
  const target = signedInRedirect(await (await pageDeps()).auth.currentUserId());
  if (target) redirect(target);
  return (
    <AccountCard
      title="Sign in"
      footer={
        <>
          <p>
            No account yet?{" "}
            <Link href="/sign-up" className="font-medium text-ink underline underline-offset-2">
              Create one
            </Link>
          </p>
          <p className="mt-2">
            <Link href="/forgot-password" className="font-medium text-ink underline underline-offset-2">
              Forgot your password?
            </Link>
          </p>
        </>
      }
    >
      <SignInForm />
    </AccountCard>
  );
}
