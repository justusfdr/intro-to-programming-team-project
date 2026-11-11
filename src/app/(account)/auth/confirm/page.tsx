import type { Metadata } from "next";
import { AccountCard } from "@/components/account/AccountCard";
import { FormMessage } from "@/components/account/FormMessage";
import { MESSAGES } from "@/lib/messages";
import { ConfirmLinkForm } from "./ConfirmLinkForm";

export const metadata: Metadata = { title: "Open your link" };

// The e-mail link lands here. Nothing is used up until the button is pressed (see confirm-link.ts).
export default async function ConfirmLinkPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string | string[]; type?: string | string[] }>;
}) {
  const params = await searchParams;
  const tokenHash = typeof params.token_hash === "string" ? params.token_hash : "";
  const type = params.type === "email" || params.type === "recovery" ? params.type : null;

  if (!tokenHash || !type) {
    return (
      <AccountCard title="Open your link">
        <FormMessage tone="error" text={MESSAGES.linkExpired} />
      </AccountCard>
    );
  }

  return (
    <AccountCard title={type === "email" ? "Confirm your email" : "Set a new password"}>
      <ConfirmLinkForm tokenHash={tokenHash} type={type} />
    </AccountCard>
  );
}
