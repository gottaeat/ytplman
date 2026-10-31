# Security

Run ytplman on localhost for your own account. Do not expose it to the internet or a shared network.
It has no server login or multi-user isolation. Its cookie input accepts a powerful YouTube session
credential.

Cookies and playlists live only in browser/request memory. No app data is written to browser
storage, disk, a database, or a session cache. Refreshing loses the current page's state. Memory can
still be read by browser extensions, injected same-origin code, or someone controlling the machine.
Browser/password-manager behavior and OS memory handling are outside the app's control.

The server uses explicit static-file routes, a Host allowlist, same-origin JSON requests, a
restrictive content security policy, and `no-store` responses. Cookies are sent to the local server
for a load/commit and used by YouTube.js; they are not returned in responses or logged. Raw
upstream/parser errors are replaced with application messages. Remote names are rendered as text.

Only an explicit confirmed commit writes to YouTube. Live edit access, owner, entry IDs, video IDs,
and order are checked first. Deletes affect exact playlist entries; they do not delete videos or
unlike them. Writes are sequential and verified. An interrupted or failed request can partly
succeed. There is no automatic retry, rollback, stored receipt, or recovery job. Load fresh state
after any failure.

Upgrading from older ytmsorter versions does not erase old browser records. Clear their site data in
your browser to remove saved credentials and drafts. Disconnecting this app or clearing its state
does not sign you out of Google. Revoke a leaked session through your Google account's security
settings.

Report vulnerabilities through the repository's private GitHub reporting channel if available.
Otherwise open an issue requesting a private contact, without credentials or exploit details. Use
synthetic data in reports. Fixes target the latest version; there is no guaranteed response time.
