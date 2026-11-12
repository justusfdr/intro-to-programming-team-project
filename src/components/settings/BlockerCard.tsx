"use client";

// Card "Focus blocker" in Settings, copied from the prototype's site-blocker card: status pill, the block
// list with add and remove, and how to install the extension. Moved here from the Focus page (spec 12),
// which keeps a small status chip. No on/off switch: when blocking runs is calculated (R15).
// The server checks every rule (spec 05); this only sends the input and shows the answer.
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { Lock, ShieldCheck, X } from "lucide-react";
import { FormMessage } from "@/components/account/FormMessage";
import { useAnnounce } from "@/components/calendar/Announcer";
import { useDisplay } from "@/components/shell/DisplayProvider";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { postJson, type PostResult } from "@/lib/client/post-json";
import { MESSAGES } from "@/lib/messages";
import { fmtTime } from "@/lib/time/display";
import { localTimeOf } from "@/lib/time/zoned";
import type { BlockerData } from "@/lib/blocker/types";
import { SettingsCardHeader, StatusPill } from "./fields";

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

// Addresses do not break in the middle of a word.
const CODE = "rounded bg-raised px-1 py-0.5 font-mono text-[12px] text-ink whitespace-nowrap";

function Code({ children }: { children: ReactNode }) {
  return <code className={CODE}>{children}</code>;
}

export function BlockerCard({ data }: { data: BlockerData }) {
  const router = useRouter();
  const announce = useAnnounce();
  const { timeFormat } = useDisplay();
  const titleId = useId();
  const inputId = useId();
  const listLabelId = useId();
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

  // R18 and R15 in words.
  const status = !data.connected
    ? MESSAGES.blockerNotConnected
    : data.blockingOn && data.blockingUntil
      ? `Blocker connected. Blocking until ${fmtTime(localTimeOf(new Date(data.blockingUntil), data.timeZone), timeFormat)}.`
      : "Blocker connected. Nothing is blocked right now.";

  return (
    <Card id="blocker" role="region" aria-labelledby={titleId} className="scroll-mt-6 p-5 md:p-6">
      <SettingsCardHeader
        icon={ShieldCheck}
        title="Focus blocker"
        titleId={titleId}
        description="Blocks distracting sites while a focus session runs, and during events of goals with auto-block. Works in Chrome."
        aside={<StatusPill state={data.connected ? "connected" : "off"}>{data.connected ? "Connected" : "Not connected"}</StatusPill>}
      />

      <p role="status" className={`mt-5 rounded-lg px-3 py-2 text-sm ${data.connected ? "bg-raised text-ink-2" : "bg-danger-soft text-danger"}`}>
        {status}
      </p>

      <div className="mt-6 border-t border-line-subtle pt-5">
        <div className="flex items-center justify-between gap-3">
          <p id={listLabelId} className="text-sm font-medium text-ink">
            Blocked sites
          </p>
          <p className="text-xs tabular text-ink-3">{data.sites.length} of 50</p>
        </div>

        <form key={formKey} onSubmit={add} noValidate className="mt-3 flex items-center gap-2">
          <label htmlFor={inputId} className="sr-only">
            Website to block
          </label>
          <input
            id={inputId}
            name="domain"
            type="text"
            placeholder="Add a site, e.g. news.com"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            maxLength={300}
            className={`h-9 min-w-0 flex-1 rounded-full border border-line bg-surface px-4 text-base text-ink placeholder:text-ink-3 md:text-sm ${FOCUS}`}
          />
          <Button type="submit" variant="secondary" className="shrink-0" disabled={busy}>
            Add
          </Button>
        </form>
        {failure && <FormMessage tone="error" text={failure.message} />}

        {data.sites.length === 0 ? (
          <p className="mt-3 text-sm text-ink-3">Nothing is blocked yet.</p>
        ) : (
          <ul aria-labelledby={listLabelId} className="mt-3 flex flex-wrap gap-1.5">
            {data.sites.map((site) => (
              <li key={site.id} className="inline-flex h-7 max-w-full items-center gap-1 rounded-full border border-line-subtle bg-surface pl-3 pr-1 text-xs text-ink">
                <span className="min-w-0 truncate" title={site.domain}>
                  {site.domain}
                </span>
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`Remove ${site.domain}`}
                  onClick={() => run(`/api/blocked-sites/${site.id}/remove`, {})}
                  className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-raised hover:text-ink ${FOCUS}`}
                >
                  <X className="size-3.5" strokeWidth={2} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-6 border-t border-line-subtle pt-5">
        <InstallSection connected={data.connected} />
      </div>

      <p className="mt-5 flex items-start gap-1.5 text-xs text-ink-3">
        <Lock className="mt-px size-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
        <span>The extension talks only to this app, and reports only visits to sites on your list.</span>
      </p>
    </Card>
  );
}

function InstallSteps() {
  return (
    <>
      <ol className="list-decimal space-y-1.5 pl-5 text-sm text-ink-2">
        <li>
          Get the extension folder from the project (the folder <Code>extension</Code>).
        </li>
        <li>
          In Chrome, open <Code>chrome://extensions</Code> and turn on Developer mode.
        </li>
        <li>
          Click Load unpacked and choose the <Code>extension</Code> folder.
        </li>
        <li>Stay signed in to LockedIn in the same Chrome profile. Within a minute this card says &ldquo;Blocker connected&rdquo;.</li>
      </ol>
      <p className="mt-3 text-xs text-ink-3">
        The blocker works only in Chrome on this computer, and only if Chrome allows third-party cookies for this site. It is a help, not a lock: you
        can end a session or edit the list at any time.
      </p>
    </>
  );
}

function InstallSection({ connected }: { connected: boolean }) {
  if (!connected) {
    return (
      <div>
        <p className="text-sm font-medium text-ink">Install the extension</p>
        <div className="mt-3">
          <InstallSteps />
        </div>
      </div>
    );
  }
  return (
    <details className="group">
      <summary className={`cursor-pointer rounded text-sm text-ink-2 hover:text-ink ${FOCUS}`}>Install on another computer</summary>
      <div className="mt-3">
        <InstallSteps />
      </div>
    </details>
  );
}
