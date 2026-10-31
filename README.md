# ytplman

One YouTube playlist, one cookie, no storage. Black and white. Monospace.
Plain HTML, CSS, JavaScript, and Node HTTP. Only dependency: `youtubei.js`.

![Playlist editor](docs/playlist-editor.png)

## Run

Node 24+:

```sh
npm ci
npm start
```

Open [localhost:3000](http://localhost:3000). Or run `docker compose up --build -d`.
`PORT` defaults to `3000`; `HOST` to `127.0.0.1`. Keep it on localhost.

## Use

1. Paste the YouTube **Cookie** request header; press **Set**.
2. Paste a playlist URL or ID; press **Load**. It must be editable by that cookie's channel.
3. **A–Z + dedupe** sorts by channel, then title. Dedupe keeps the first exact channel + title match, including case and spaces. Different video IDs can match.
4. Check songs, Shift-click a range, or choose **All**. Drag to reorder; **↑ / ↓** also moves the selection. **Delete** removes selected entries. **Reset** restores the loaded order.
5. **Commit…** shows deletions and old → new positions. **Commit to YouTube** applies them. The progress bar completes after verification.

Cookie: sign in to YouTube → developer tools → Network → reload → select a YouTube request → copy **Request Headers → Cookie**. Paste only the header value. Keep it private.

Refresh/close loses the cookie and edits. No browser storage, files, database, or session cache. Clear old ytmsorter site data manually if upgrading.

Commits recheck live ownership, permissions, entry IDs, videos, and order. Writes are sequential, at least one second apart, with final verification. A failed/disconnected commit may be partial: load again. No retries or rollback. Removing entries does not delete videos or unlike songs. Avoid concurrent edits elsewhere.

Uses the unofficial [YouTube.js](https://github.com/LuanRT/YouTube.js) API; it may break or put your account at risk. System/read-only playlists are unsupported.

## Check

```sh
npm test
npm run demo
```

Demo: [localhost:3001](http://localhost:3001), cookie `SAPISID=demo`, playlist `PLdemo`. Synthetic memory only; never contacts YouTube. Restart to reset.

Optional browser regression: `node scripts/ui-smoke.mjs`. Set `PLAYWRIGHT_MODULE` and `BROWSER_EXECUTABLE` for existing local installations. `UI_SCREENSHOT=/absolute/path.png` refreshes the image. See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

[AGPL-3.0-only](LICENSE). © 2026 ytplman contributors. Not affiliated with Google or YouTube.
