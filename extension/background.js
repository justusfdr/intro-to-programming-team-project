/* global chrome */
// The extension's service worker. Once a minute it asks the LockedIn app what to block (R16), keeps
// Chrome's redirect rules in line with the answer, moves tabs already open on a blocked site to the
// block page (R15), and sends the attempts the block page reports. All decisions are in lib/.
//
// It holds no keys: the request carries the app's own sign-in cookie of this Chrome profile.
// Fail closed: without a valid answer, nothing is blocked.
import { APP_URL, POLL_MINUTES } from "./config.js";
import { buildRules, isBlockedHost, nextKept, sitesToBlock } from "./lib/answer.js";
import { addAttempt, BATCH, dropOld, isRealAttempt } from "./lib/attempts.js";

const POLL = "poll";
const UNTIL = "until";
const TIMEOUT_MS = 10_000;

// ---- storage ----

async function getKept() {
  return (await chrome.storage.local.get("kept")).kept ?? null;
}

/** A random value that marks this browser session's redirects (kept in memory-only storage). */
async function getNonce() {
  const { nonce } = await chrome.storage.session.get("nonce");
  if (typeof nonce === "string" && nonce) return nonce;
  const fresh = crypto.randomUUID();
  await chrome.storage.session.set({ nonce: fresh });
  return fresh;
}

// ---- talking to the app ----

async function post(path, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(`${APP_URL}${path}`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function askApp() {
  try {
    const response = await post("/api/extension/state", {});
    if (response.status === 200) return { kind: "answer", body: await response.json().catch(() => null) };
    if (response.status >= 500) return { kind: "unreachable" };
    return { kind: "refused" };
  } catch {
    return { kind: "unreachable" };
  }
}

async function sendAttempts() {
  const queue = dropOld((await chrome.storage.local.get("attempts")).attempts, Date.now());
  if (queue.length === 0) return;
  const batch = queue.slice(0, BATCH);
  try {
    const response = await post("/api/extension/attempts", { attempts: batch });
    // Sent (the app keeps only listed domains); keep the rest for the next time.
    if (response.status === 200) await chrome.storage.local.set({ attempts: queue.slice(batch.length) });
    else await chrome.storage.local.set({ attempts: queue });
  } catch {
    await chrome.storage.local.set({ attempts: queue });
  }
}

// ---- applying the answer ----

async function apply(kept) {
  const now = Date.now();
  const sites = sitesToBlock(kept, now);
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.map((rule) => rule.id),
    addRules: buildRules(sites, await getNonce()),
  });

  // Drop the rules exactly at blocking_until, also if the app cannot be reached by then.
  await chrome.alarms.clear(UNTIL);
  if (sites.length > 0) chrome.alarms.create(UNTIL, { when: kept.blockingUntil });

  // Tabs already open on a blocked site go to the block page too; that is not an attempt (R15).
  if (sites.length > 0) {
    for (const tab of await chrome.tabs.query({})) {
      let host = "";
      try {
        const url = new URL(tab.url ?? "");
        if (url.protocol === "http:" || url.protocol === "https:") host = url.hostname;
      } catch {
        // not a web page
      }
      const site = host && sites.find((s) => isBlockedHost(host, [s]));
      if (site) {
        await chrome.tabs.update(tab.id, { url: chrome.runtime.getURL(`blocked.html?site=${encodeURIComponent(site)}&via=open`) });
      }
    }
  }
}

async function poll() {
  const kept = nextKept(await getKept(), await askApp(), Date.now());
  await chrome.storage.local.set({ kept });
  await apply(kept);
  if (kept) await sendAttempts();
}

// ---- events ----

chrome.runtime.onInstalled.addListener(() => chrome.alarms.create(POLL, { periodInMinutes: POLL_MINUTES }));
chrome.runtime.onStartup.addListener(() => chrome.alarms.create(POLL, { periodInMinutes: POLL_MINUTES }));

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === POLL) poll();
  if (alarm.name === UNTIL) getKept().then(apply);
});

// Only the extension's own pages can send messages here (no "externally_connectable").
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;
  (async () => {
    const kept = await getKept();
    if (message?.type === "attempt") {
      if (isRealAttempt(message, await getNonce(), sitesToBlock(kept, Date.now()))) {
        const { attempts } = await chrome.storage.local.get("attempts");
        await chrome.storage.local.set({ attempts: addAttempt(attempts, message.site, Date.now()) });
        sendAttempts();
      }
      sendResponse({ ok: true });
    } else if (message?.type === "status") {
      sendResponse({ blockingUntil: kept && kept.blockingOn ? kept.blockingUntil : null, appUrl: APP_URL });
    } else {
      sendResponse(null);
    }
  })();
  return true;
});

// Ask at once whenever the service worker starts.
poll();
