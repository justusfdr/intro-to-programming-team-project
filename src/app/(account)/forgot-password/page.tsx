import type { Metadata } from "next";
import Link from "next/link";
import { AccountCard } from "@/components/account/AccountCard";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <AccountCard
      title="Reset your password"
      footer={
        <>
          Remembered it?{" "}
          <Link href="/sign-in" className="font-medium text-ink underline underline-offset-2">
            Sign in
          </Link>
        </>
      }
    >
      <p className="mb-4 text-sm text-ink-2">Enter your email and we will send you a link to set a new password.</p>
      <ForgotPasswordForm />
    </AccountCard>
  );
}
