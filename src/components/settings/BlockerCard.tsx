"use client";

// Card "Focus blocker" in Settings, copied from the prototype's site-blocker card: status pill, the block
// list with add and remove, and how to install the extension: a download of the extension set to this
// app, and a guide in five steps (spec 18). Moved here from the Focus page (spec 12),
// which keeps a small status chip. No on/off switch: when blocking runs is calculated (R15).
// The server checks every rule (spec 05); this only sends the input and shows the answer.
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { Check, Copy, Download, Lock, ShieldCheck, X } from "lucide-react";
import { FormMessage } from "@/components/account/FormMessage";
import { useAnnounce } from "@/components/calendar/Announcer";
import { useDisplay } from "@/components/shell/DisplayProvider";
import { Button, buttonClass } from "@/components/ui/Button";
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

/** One step of the guide: its number, a short title, and what to do. */
function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="relative flex gap-3 pb-5 last:pb-0">
      {/* The line down to the next step. */}
      <span aria-hidden="true" className="absolute bottom-0 left-[13px] top-8 w-px bg-line-subtle [li:last-child>&]:hidden" />
      <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-semibold tabular text-white">
        {n}
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-sm font-medium text-ink">
          <span className="sr-only">Step {n}: </span>
          {title}
        </p>
        <div className="mt-1 space-y-2 text-sm text-ink-2">{children}</div>
      </div>
    </li>
  );
}

/** Chrome does not open chrome:// links from a website, so the address is copied instead. */
function CopyAddress({ address }: { address: string }) {
  const announce = useAnnounce();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      announce("Copied");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // No clipboard access (an old browser, or not allowed): the address stays readable next to the button.
    }
  }

  return (
    <span className="inline-flex max-w-full items-center gap-1.5">
      <Code>{address}</Code>
      <button
        type="button"
        onClick={copy}
        className={`inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-line-subtle bg-surface px-2 text-[11px] font-medium text-ink-2 hover:bg-raised hover:text-ink ${FOCUS}`}
      >
        {copied ? <Check className="size-3" strokeWidth={2.2} aria-hidden="true" /> : <Copy className="size-3" strokeWidth={2} aria-hidden="true" />}
        {copied ? "Copied" : "Copy"}
      </button>
    </span>
  );
}

function InstallSteps() {
  return (
    <>
      <p className="mb-4 text-sm text-ink-2">Takes about two minutes. You need Google Chrome on this computer.</p>
      <ol className="list-none">
        <Step n={1} title="Download the extension">
          <p>
            <a href="/api/extension/download" download className={buttonClass("primary", "sm")}>
              <Download className="size-3.5" strokeWidth={2} aria-hidden="true" />
              Download extension
            </a>
          </p>
          <p>
            Open the downloaded file <Code>lock-in-blocker.zip</Code> to unpack it. You get a folder <Code>lock-in-blocker</Code>. Move it to a place
            where it can stay, for example Documents: Chrome loads the extension from that folder every time.
          </p>
        </Step>
        <Step n={2} title="Open Chrome&rsquo;s extensions page">
          <p>
            Copy this address and paste it into Chrome&rsquo;s address bar: <CopyAddress address="chrome://extensions" />
          </p>
        </Step>
        <Step n={3} title="Turn on Developer mode">
          <p>
            It is the switch at the top right of that page. Chrome needs it for extensions that do not come from its store.
          </p>
        </Step>
        <Step n={4} title="Load the folder">
          <p>
            Click <strong className="font-medium text-ink">Load unpacked</strong> at the top left and choose the folder <Code>lock-in-blocker</Code>.
            &ldquo;Lock In Blocker&rdquo; appears in the list.
          </p>
        </Step>
        <Step n={5} title="Done">
          <p>
            Stay signed in to Lock In in the same Chrome profile. Within a minute this card says &ldquo;Blocker connected&rdquo;.
          </p>
        </Step>
      </ol>

      <details className="group mt-5 rounded-lg bg-raised px-3 py-2">
        <summary className={`cursor-pointer rounded text-sm font-medium text-ink ${FOCUS}`}>Still &ldquo;Not connected&rdquo; after a minute?</summary>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-ink-2">
          <li>
            <strong className="font-medium text-ink">Not in Chrome?</strong> The blocker does not work in Safari, Firefox or other browsers. Open Lock In
            in Chrome and sign in there.
          </li>
          <li>
            <strong className="font-medium text-ink">Another Chrome profile?</strong> The extension and your Lock In sign-in must be in the same profile.
          </li>
          <li>
            <strong className="font-medium text-ink">Third-party cookies blocked?</strong> In Chrome&rsquo;s settings, under Privacy and security, Third-party
            cookies, add this site to &ldquo;Sites allowed to use third-party cookies&rdquo;.
          </li>
          <li>
            <strong className="font-medium text-ink">Folder moved or deleted?</strong> Chrome then loses the extension. Load the folder again (step 4).
          </li>
        </ul>
      </details>

      <p className="mt-3 text-xs text-ink-3">
        The blocker works only in Chrome on this computer. It is a help, not a lock: you can end a session or edit the list at any time.
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
