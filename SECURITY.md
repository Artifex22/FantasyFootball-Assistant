# Security Review

## Boundary

This project treats all online information as untrusted text. No downloaded code, package, model, executable, browser extension, remote script, or remote asset is included or run.

## Controls

- Zero third-party runtime dependencies.
- Local Node.js server binds only to `127.0.0.1`.
- Host allowlist reduces DNS-rebinding exposure.
- Path resolution prevents directory traversal.
- Only known static file extensions are served.
- Content Security Policy blocks all network connections and remote scripts/styles.
- Frames, objects, forms, camera, microphone, geolocation, payments, and USB are disabled.
- External research links open with `noopener` and `noreferrer`.
- Imported CSV/JSON is parsed as data and rendered through `textContent`; it is never evaluated as code or injected as HTML.
- Imported draft history and final-roster exports are normalized into inert arrays. Player names and team names are rendered only through `textContent`.
- The public repository contains generic manager placeholders and no private league history.
- Local league profiles are git-ignored, parsed as JSON rather than code, limited to 5 MB in the UI, and stored in browser `localStorage` only after import.
- Reviewed projection, schedule, availability, and team-stat tables are stored as inert numeric/string arrays in `context-data.js`; no source markup or code is retained.
- Historical cohort expansion, wait calibration, and snapshot registry files contain only manually encoded inert records and deterministic local calculations.
- User state remains in browser `localStorage` unless manually exported.

## Remaining Risks

- External links leave the local application. Review destinations before opening.
- Browser extensions can observe local pages outside this project's control.
- A malicious local file can contain extreme values; numeric inputs are clamped, but imported projections are trusted as user-supplied data.
- Analyst rankings and player/team information change. Stale data is a decision-quality risk, not a code-execution risk.

## Verification

Run `node --test`, then inspect response headers from `http://127.0.0.1:4173` before use. No `npm install` or internet access is needed.
