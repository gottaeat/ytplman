# Contributing

Keep only the specified playlist operations. Black/white CSS, monospace, native browser controls and dragging. No storage, framework, build step, or extra dependency.

- `public/`: HTML, CSS, UI, and pure playlist operations.
- `src/`: Node HTTP, YouTube adapter, validated commits.
- `tests/`: Node tests with fake clients.
- `scripts/`: synthetic demo and optional Playwright regression.

Use Node 24+. Run `npm test`, `node scripts/ui-smoke.mjs`, and `docker build -t ytplman .` after runtime changes. Playwright/Chromium are external test tools, not application dependencies; see the README for paths and screenshot capture.

Check monochrome rendering under a light system theme, group dragging, shift-selection, up/down, deletion/reset, review/cancel, progress/failure/reload recovery, empty lists, reload reset, and narrow screens. New edits must hide completed progress. Local edits must make no requests. Use only synthetic data and cookies in tests/screenshots.

Dedupe exact channel + title strings; keep the first. Edit by entry ID, never video ID. Preserve selected order. Validate live state, pace writes, verify the result, and never retry uncertain writes. Render remote strings as text; never log credentials or upstream errors. Keep the AGPL license and credential ignore rules.
