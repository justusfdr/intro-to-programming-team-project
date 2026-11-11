import type { Metadata } from "next";
import Link from "next/link";
import { AccountCard } from "@/components/account/AccountCard";
import { SignUpForm } from "./SignUpForm";

export const metadata: Metadata = { title: "Create your account" };

export default function SignUpPage() {
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
