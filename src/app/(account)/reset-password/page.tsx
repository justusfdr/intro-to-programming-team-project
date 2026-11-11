import type { Metadata } from "next";
import { AccountCard } from "@/components/account/AccountCard";
import { ResetPasswordForm } from "./ResetPasswordForm";

export const metadata: Metadata = { title: "Set a new password" };

// Reached from the reset link (see /auth/confirm). Only a session that the reset link created can use it.
export default function ResetPasswordPage() {
  return (
    <AccountCard title="Set a new password">
      <ResetPasswordForm />
    </AccountCard>
  );
}
