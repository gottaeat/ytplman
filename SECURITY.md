# Security

Localhost only. No login or multi-user isolation. YouTube cookies grant account access; keep them private.

Credentials, playlists, and edits stay in browser/request memory. No persistence or session cache. Extensions and anyone controlling the machine may read memory. Clear legacy ytmsorter site data manually. Clearing this app does not revoke your Google session.

HTTP uses explicit file routes, Host/origin checks, JSON-only inputs, size limits, CSP, and `no-store`. Cookies and raw upstream errors are never returned or logged. Remote strings are rendered as text.

Only a confirmed commit writes. It checks live permissions, owner, entry IDs, videos, and order, then writes sequentially and verifies. Failure/disconnection may leave partial changes; load again. No rollback or retry. In-flight writes may finish after disconnection.

Report vulnerabilities privately through GitHub if available; otherwise request a private contact in an issue. Never include credentials or exploit details publicly. Fixes target the latest version.
