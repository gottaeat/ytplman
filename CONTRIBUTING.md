# Contributing

Keep ytplman small: one cookie, one playlist, one list, one commit review. Permanent dark mode. No
persistence, framework, build step, account settings, multi-playlist workspace, or new dependency
without a concrete need.

## Files

- `public/index.html`, `app.css`, `app.js`: the entire interface.
- `public/model.js`: sorting, exact string dedupe, selection moves, and commit planning.
- `src/youtube.js`: the only external adapter; cookies, playlist reads, exact-entry edits.
- `src/commit.js`: preflight, sequential writes, verification, streamed progress.
- `src/server.js`, `index.js`: Node HTTP and startup.
- `tests/`: Node tests with fake clients only.
- `scripts/demo.mjs`: synthetic playlist server for visual checks.
- `scripts/ui-smoke.mjs`: optional browser regression and screenshot.

## Check

Use Node 24 or newer. Run `npm ci`, `npm test`, and `docker build -t ytplman .` after runtime
changes. Tests must never use real cookies or contact YouTube.

The optional browser test needs an existing Playwright/Chromium installation; neither is an
application dependency:

```sh
node scripts/ui-smoke.mjs
```

`PLAYWRIGHT_MODULE` can point to an absolute Playwright module, and `BROWSER_EXECUTABLE` to
Chromium/Chrome. `UI_SCREENSHOT=/absolute/path.png` refreshes the documentation image from the
test's synthetic sorted playlist. The test uses its own port and browser context.

Check dark mode with a light browser preference, empty and long lists, shift-selection, group moves,
upward/downward drags, edge scrolling, deletion, reset, review cancellation, successful/failed
progress, reload losing state, and a narrow viewport. Confirm that sorting, selection, dragging, and
review make no requests. Test failures and interrupted commits with fakes, never on a real account.

## Rules

Dedupe is exact channel + title equality, keeping the first current entry. Sort comparisons must not
change that equality rule. Reorder and delete by playlist entry ID, never video ID. Preserve
selected song order. Keep controls still during a drag.

Never persist cookies, playlists, drafts, or receipts. Never log raw upstream errors or request
bodies. Render all remote strings as text. A commit must recheck live state, pace writes, stop on
failure, and verify the result. Do not retry an uncertain write.

Use synthetic metadata in screenshots. Review the exact staged files before publishing; local
credential exports from earlier versions must remain ignored. Keep the existing AGPL license.
