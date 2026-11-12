# Spec 18: Download the Chrome extension from the app, with a guide
Branch `18-extension-download`, from `main`. Plan: `docs/ontology.md` (R16, R18: unchanged; R3). No change to the database.

## Why
The blocker card in Settings said "Get the extension folder from the project". A user of the app has no project folder, so the extension could not be installed at all without the code. The owner asked for a download and a clear guide.

## What
- [ ] `GET /api/extension/download` answers with `lock-in-blocker.zip`: the files of the project's `extension` folder inside one folder `lock-in-blocker`, without tests and the developer README. `config.js` carries this app's own address (`APP_URL` of the server, only its origin), so nothing is edited by hand. Every other file is unchanged, so the extension keeps its id.
- [ ] Signed-in users only (R3): signed out, the answer is 401 "Please sign in." and no file. The request's content is not read; nothing is read from the database. The answer is never cached.
- [ ] The ZIP is written by a small writer of our own (`src/lib/zip/store.ts`, files stored without compression); no new package. It refuses paths that are absolute or climb out of the archive.
- [ ] The blocker card shows the guide in five numbered steps: 1 "Download the extension" with the button and what to do with the file; 2 "Open Chrome's extensions page" with `chrome://extensions` and a Copy button (a website cannot open that address); 3 "Turn on Developer mode"; 4 "Load the folder"; 5 "Done".
- [ ] Below the steps, "Still 'Not connected' after a minute?" opens the usual causes: not in Chrome, another Chrome profile, third-party cookies blocked, the folder moved or deleted.
- [ ] Connected: the guide stays folded under "Install on another computer", as before.

## Out of scope
Publishing the extension in the Chrome Web Store (then the guide becomes one click); other browsers; telling the user's browser apart to show the Chrome hint only where it applies; updating an installed extension automatically.

## Done when
All tests pass; existing server, database and rule tests unchanged. New: `src/lib/zip/store.test.ts` (reads back, same bytes, bad paths refused), `src/lib/server/extension/package.test.ts` (the files, the address in `config.js`, tests and README left out, the id kept, bad addresses refused, no manifest refused), `BlockerCard.test.tsx` (the download link and the five steps). `npm run check` passes. Tried by hand: the download opens with the system's unzip, and signed out it answers 401. The owner tests it, then it is merged.
