# ytplman

One playlist. One cookie. No storage.

A small, dark YouTube playlist editor. Paste a cookie and a playlist link, arrange the songs, review
the changes, commit. No account setup, library, database, browser storage, saved drafts, or frontend
framework.

![ytplman: two inputs, one dark song list, and simple editing controls](docs/playlist-editor.png)

## Run

Node.js 24 or newer:

```sh
npm ci
npm start
```

Open [localhost:3000](http://localhost:3000).

Or use Docker:

```sh
docker compose up --build -d
```

## Use

1. Paste your YouTube **Cookie** request header and press **Set cookie**.
2. Paste a playlist link and press **Load playlist**. Use an editable playlist owned by that
   signed-in channel.
3. Press **Sort A–Z + dedupe**, or arrange the songs yourself.
4. Press **Commit…** to see every deletion and the complete final order. Close the review to keep
   editing, or press **Commit to YouTube**.
5. Keep the page open. The progress bar reaches 100% after YouTube's final playlist has been
   checked.

To get the cookie: sign in to YouTube, open developer tools → **Network**, reload, select a request
to `www.youtube.com`, and copy the **Cookie** value under **Request Headers**. Paste that single
header value, not all headers or a cookies file. Cookies are credentials: keep them private.

## Arrange songs

- **Sort A–Z + dedupe** sorts by the artist/channel string returned by YouTube, then the title.
  Sorting is English, case-insensitive, with natural number ordering. It does not guess artists from
  titles or strip channel suffixes.
- Dedupe compares **both channel and title exactly**, including case and spaces. The first entry
  survives. Different video IDs with the same two strings count as duplicates; different titles or
  channels remain distinct. Same-title uploads can be different recordings: inspect the commit
  review.
- Check songs to select them. Shift-click selects a range. **Select all** selects the whole list.
- Drag a song to move it. Drag a selected song to move the selection together, preserving its order.
  The line marks the insertion point. Drag near the top/bottom edge to scroll; on touch, drag the
  grip.
- **↑ / ↓** moves the selection one position. **Delete selected** removes it from the draft. It does
  not delete videos or change likes.
- **Reset edits** returns to the loaded playlist. Nothing writes to YouTube until you confirm a
  commit.

## Nothing is saved

The cookie, loaded playlist, and edits exist only in memory. Refreshing or closing the page loses
them. The app sets no browser cookies and uses no localStorage, sessionStorage, IndexedDB, files,
database, or session cache. HTTP responses use `Cache-Control: no-store`.

Upgrading from ytmsorter? Clear that origin's old site data once in your browser settings to remove
previously saved credentials and drafts. This rewrite neither reads nor migrates them.

## Commits

Before writing, the server reloads the playlist and checks edit access, owner, entry IDs, video IDs,
and order against the loaded version. If anything changed, load again. Removals address exact
playlist entries, so repeated video IDs stay distinct. Writes run sequentially, at least one second
apart, followed by a full order check. Progress streams over the commit request; there are no
background jobs or stored receipts.

A failed or interrupted commit can have changed YouTube. There is no rollback, automatic retry, or
resume. Load the playlist again to inspect its actual state before editing further. Closing the
connection stops subsequent writes when detected; an in-flight write may still finish. Do not edit
the same playlist elsewhere during a commit.

This uses the unofficial [YouTube.js](https://github.com/LuanRT/YouTube.js) API. It can break, and
cookie-based automation carries account risk. Keep this app on localhost. It is a personal tool, not
a public service. Liked Music and other non-editable/system playlists are not supported.

## Configuration

- `PORT`: `3000` by default.
- `HOST`: `127.0.0.1` by default; Docker listens internally on `0.0.0.0`, with Compose publishing
  loopback only.
- `BASE_URL`: optional additional allowed origin, useful behind a local proxy.

One server process accepts one commit at a time. Maximum 10,000 playlist entries and 8 MiB per JSON
request. There are no credentials in environment variables or server configuration.

## Development

```sh
npm test
npm run demo
```

The demo runs at [localhost:3001](http://localhost:3001). Use `SAPISID=demo` as the cookie and
`PLdemo` as the playlist. All changes affect synthetic process memory; it never contacts YouTube.
Restart it to reset the playlist.

The only direct dependency is `youtubei.js`. HTTP, tests, files, and streaming use Node's standard
library. The frontend is plain HTML, CSS, and JavaScript. See [CONTRIBUTING.md](CONTRIBUTING.md) for
browser checks and [SECURITY.md](SECURITY.md) for security boundaries.

## License

[GNU AGPL v3.0](LICENSE), `AGPL-3.0-only`. Copyright © 2026 ytplman contributors. Third-party
dependencies retain their licenses. Not affiliated with Google or YouTube.
