# LockedIn Blocker (Chrome extension)

While you focus, Chrome stops the sites on your LockedIn block list. LockedIn decides when; the
extension only follows (spec 05, ontology R15 to R18). Plain JavaScript, Manifest V3, no build step,
no code from anywhere else.

## Load the extension
Users of the app download the extension in Settings, "Focus blocker": the file `lockedin-blocker.zip` is this
folder with the app's own address already in `config.js` (spec 18). The steps below are for working on the
extension from the project folder.

1. In `config.js`, set `APP_URL` to the app's address: the deployed address for the real app, or
   `http://localhost:3000` while working locally. No slash at the end. This is the only setting.
2. In Chrome, open `chrome://extensions` and switch on **Developer mode**.
3. Choose **Load unpacked** and pick this `extension` folder.
4. Sign in to LockedIn in the same Chrome profile. Within a minute the Focus page says "Blocker connected".

The extension's id is always `dghmihlicabdooieaknglfjlidpjjfki`: it follows from the public key in
`manifest.json` (`"key"`). The server accepts requests only from that id. If the key is ever
replaced, set `EXTENSION_ID` on the server to the new id.

## How it works
- Every 30 seconds (`alarms`) it asks the app: `POST /api/extension/state`. The request carries the
  app's own sign-in cookie of this Chrome profile; the extension holds no keys. The answer has only
  the block list, whether blocking is on, and until when.
- While blocking is on, a redirect rule per site (`declarativeNetRequest`) sends page loads of the
  site and its subdomains to the block page. Tabs already open on a listed site are moved there too.
- The block page says which site was stopped and when blocking ends. When it was reached through the
  extension's own redirect, it reports one attempt, which is sent to `POST /api/extension/attempts`.
- **Fails closed:** signed out, refused (401, 403) or an answer that is not exactly right: every rule
  is removed at once. App unreachable: the last answer is kept only until its end time; attempts wait
  in Chrome's storage for up to 48 hours and are sent later.

The decisions are in `lib/answer.js` and `lib/attempts.js` (pure functions, tested with the rest of
the project: `npm test`). `background.js` only connects them to Chrome.

## Permissions, and why
| Permission | Why |
|---|---|
| `declarativeNetRequest` | Redirect page loads of listed sites to the block page. |
| host access `http://*/*`, `https://*/*` | Redirect rules need access to the sites you choose to block, which can be any site. It also lets the extension reach the app with its sign-in cookie, and read the address of open tabs to move those on a listed site. |
| `alarms` | Ask the app every 30 seconds, and remove the rules exactly when blocking ends. |
| `storage` | Keep the last answer and the attempts not yet sent, on this computer only. |
| `blocked.html` as a web-accessible page | Chrome needs it to show the block page in place of the site. |

## What counts as an attempt, and what can be forged
Only a page load that the extension's own rule redirected counts. Those redirects carry a random value
the extension creates at browser start and keeps in memory-only storage. The block page reports it,
and the service worker counts the attempt only if the value matches, the site is on the list and
blocking is on. The block page is also reachable only through an address that changes every browser
session (`use_dynamic_url`), so a website cannot open or embed it.

What remains: another extension installed in the same Chrome can read tab addresses and could copy the
value, or simply open the listed site itself. A reload of the block page within 5 seconds counts once.

## Limits (R18 and two more)
- Only page loads in Chrome on this computer are blocked: not other browsers, phone apps or other
  programs, and there is no screen time measurement. Blocking can start up to 30 seconds late (a tab that opens a listed site asks the app at once).
- The blocker is a help, not a lock: you can end a session, switch off auto-block, edit the list, or
  remove the extension at any time.
- **Third-party cookies:** if Chrome is set to block third-party cookies, Chrome does not send the
  app's sign-in cookie with the extension's requests. The app then answers "not signed in" and
  nothing is blocked. Allow cookies for the app's address (Chrome settings, Privacy and security,
  Third-party cookies, "Sites allowed to use third-party cookies").
- **Other extensions:** an extension with access to all sites can act on the app's pages in your
  name anyway. LockedIn cannot protect against that; install only extensions you trust.
