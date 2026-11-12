"use client";

// The blocker on the Focus page (spec 05): whether the Chrome extension is connected (R18), whether
// blocking is on and until when (R15), the block list with add and remove (R17), and how to get
// the extension. The server checks every rule; this only sends the input and shows the answer.
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { FormMessage } from "@/components/account/FormMessage";
import { useAnnounce } from "@/components/calendar/Announcer";
import { Button } from "@/components/ui/Button";
import { TriangleAlert, X } from "lucide-react";
import { postJson, type PostResult } from "@/lib/client/post-json";
import { MESSAGES } from "@/lib/messages";
import { localTimeOf } from "@/lib/time/zoned";
import type { BlockerData } from "@/lib/blocker/types";

const eyebrow = "text-[11px] font-medium uppercase tracking-[0.06em] text-ink-3";

function Status({ data }: { data: BlockerData }) {
  if (!data.connected) {
    return (
      <p className="flex items-start gap-2 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" />
        {MESSAGES.blockerNotConnected}
      </p>
    );
  }
  return (
    <p className="flex items-center gap-2 rounded-xl bg-success-soft px-3 py-2 text-sm text-success">
      <span aria-hidden className="size-2 rounded-full bg-success" />
      {data.blockingOn && data.blockingUntil
        ? `Blocker connected. Blocking until ${localTimeOf(new Date(data.blockingUntil), data.timeZone)}.`
        : "Blocker connected. Nothing is blocked right now."}
    </p>
  );
}

export function BlockerCard({ data }: { data: BlockerData }) {
  const router = useRouter();
  const announce = useAnnounce();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<PostResult | null>(null);
  const [formKey, setFormKey] = useState(0);

  async function run(path: string, body: unknown, onDone?: () => void) {
    setBusy(true);
    const answer = await postJson(path, body);
    setBusy(false);
    setFailure(answer.ok ? null : answer);
    if (!answer.ok) return;
    announce(answer.message);
    onDone?.();
    router.refresh();
  }

  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const domain = String(new FormData(event.currentTarget).get("domain") ?? "");
    run("/api/blocked-sites", { domain }, () => setFormKey((k) => k + 1));
  }

  return (
    <section aria-labelledby="blocker-title" className="rounded-card border border-line-subtle bg-surface p-5">
      <h2 id="blocker-title" className="text-[15px] font-semibold text-ink">
        Blocker
      </h2>
      <p className="mt-1 text-sm text-ink-2">During a session, and during events of goals with auto-block, Chrome stops these sites.</p>
      <div className="mt-4">
        <Status data={data} />
      </div>

      <div className="mt-5 flex items-baseline justify-between">
        <h3 className={eyebrow}>Blocked sites</h3>
        <span className="text-xs tabular text-ink-3">{data.sites.length} of 50</span>
      </div>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {data.sites.map((site) => (
          <li key={site.id} className="inline-flex h-8 items-center gap-1 rounded-full border border-line bg-surface pl-3 pr-1 text-sm">
            {site.domain}
            <button
              type="button"
              disabled={busy}
              onClick={() => run(`/api/blocked-sites/${site.id}/remove`, {})}
              aria-label={`Remove ${site.domain}`}
              className="flex size-6 items-center justify-center rounded-full text-ink-3 hover:bg-raised hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
            >
              <X className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>

      <form key={formKey} onSubmit={add} noValidate className="mt-3 flex gap-2">
        <label htmlFor="blocked-site" className="sr-only">
          Website to block
        </label>
        <input
          id="blocked-site"
          name="domain"
          placeholder="instagram.com"
          autoComplete="off"
          className="block h-9 min-w-0 flex-1 rounded-full border border-line bg-surface px-3.5 text-sm text-ink placeholder:text-ink-3 focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/10"
        />
        <Button type="submit" variant="secondary" disabled={busy}>
          Add
        </Button>
      </form>
      {failure && <FormMessage tone="error" text={failure.message} />}

      <details className="mt-5 text-sm text-ink-2">
        <summary className="cursor-pointer font-medium text-ink">Get the Chrome extension</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Get the extension folder from the project (the folder <code>extension</code>).</li>
          <li>In Chrome, open <code>chrome://extensions</code> and switch on Developer mode.</li>
          <li>Choose &ldquo;Load unpacked&rdquo; and pick the <code>extension</code> folder.</li>
          <li>Stay signed in to Lock In in the same Chrome profile. Within a minute this card says &ldquo;Blocker connected&rdquo;.</li>
        </ol>
        <p className="mt-2 text-xs text-ink-3">
          The blocker works only in Chrome on this computer, and only if Chrome allows third-party cookies for this site. It is a help, not a lock: you can
          end a session or edit the list at any time.
        </p>
      </details>
    </section>
  );
}
