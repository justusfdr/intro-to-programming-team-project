import { APP_NAME } from "@/lib/app-name";
import { SignOutButton } from "@/components/account/SignOutButton";

// Start page for signed-in users. src/proxy.ts sends everyone else to the sign-in page.
// The calendar replaces this page in spec 02.
export default function HomePage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-heading">{APP_NAME}</h1>
      <p className="mt-2 text-ink-2">You are signed in. The calendar comes in the next build step.</p>
      <div className="mt-6">
        <SignOutButton />
      </div>
    </main>
  );
}
