import type { Metadata } from "next";
import Link from "next/link";
import { AccountCard } from "@/components/account/AccountCard";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
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
