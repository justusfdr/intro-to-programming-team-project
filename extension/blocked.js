/* global chrome */
// The block page. It shows which site was stopped and until when blocking lasts, and tells the
// service worker about the attempt; the service worker counts it only if this page was reached
// through the extension's own redirect (see lib/attempts.js). Text is set with textContent only.
const params = new URLSearchParams(location.search);
const site = (params.get("site") ?? "").slice(0, 253);
const DOMAIN = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/;
const shown = DOMAIN.test(site) ? site : "This site";

document.getElementById("lead").textContent = `${shown} is blocked while you focus.`;

chrome.runtime.sendMessage({ type: "attempt", site, via: params.get("via"), n: params.get("n") }).catch(() => {});

chrome.runtime
  .sendMessage({ type: "status" })
  .then((status) => {
    if (!status) return;
    const back = document.getElementById("back");
    back.href = `${status.appUrl}/focus`;
    back.textContent = "Back to LockedIn";
    if (Number.isFinite(status.blockingUntil)) {
      const until = document.getElementById("until");
      const time = new Date(status.blockingUntil).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      until.textContent = `Blocking ends at ${time}.`;
      until.hidden = false;
    }
  })
  .catch(() => {});
