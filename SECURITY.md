# Security Review

## Boundary

This project treats all online information as untrusted text. No downloaded code, package, model, executable, browser extension, remote script, or remote asset is included or run.

## Controls

- Zero third-party runtime dependencies.
- Local Node.js server binds only to `127.0.0.1`.
- Host allowlist reduces DNS-rebinding exposure.
- Path resolution prevents directory traversal.
- Only known static file extensions are served.
- Content Security Policy blocks remote scripts/styles and permits only same-origin API requests.
- Frames, objects, forms, camera, microphone, geolocation, payments, and USB are disabled.
- External research links open with `noopener` and `noreferrer`.
- Imported CSV/JSON is parsed as data and rendered through `textContent`; it is never evaluated as code or injected as HTML.
- Imported draft history and final-roster exports are normalized into inert arrays. Player names and team names are rendered only through `textContent`.
- The public repository contains generic manager placeholders and no private league history.
- Local league profiles are git-ignored and parsed as JSON rather than code. Static imports remain in browser `localStorage`; self-hosted profiles and per-league app state are normalized and stored in isolated `.local-data/league-workspaces.json` workspaces.
- Connector credentials are stored under git-ignored `.local-data` files with restrictive permissions where supported; API status responses never include secret values.
- Workspace APIs are same-origin only for mutations, cap request bodies, filter prototype-pollution keys, and never include connector credentials in workspace exports or browser bootstrap data.
- The Codex refresh endpoint accepts no browser-supplied command, executable, working directory, file path, or prompt. It starts one fixed `codex exec` workflow with `shell: false`, `workspace-write` sandboxing, and local-only logs. A separately runnable executable must pass a version check before the button is enabled.
- Yahoo authorization uses OAuth state validation and retains tokens only on the server.
- ESPN capture uses a dedicated Firefox profile and queries only the two required ESPN cookie names and ESPN league URLs. It retains only `espn_s2`, `SWID`, and normalized league references. HAR contents are filtered to ESPN hosts and discarded after parsing.
- Mutating connector routes reject cross-origin browser requests.
- ESPN roster and matchup responses are reduced to normalized team IDs, player/slot data, projections, actual scores, injury labels, and schedule pairings. Raw provider responses are not written to disk.
- Reviewed projection, schedule, availability, and team-stat tables are stored as inert numeric/string arrays in `context-data.js`; no source markup or code is retained.
- Historical cohort expansion, wait calibration, and snapshot registry files contain only manually encoded inert records and deterministic local calculations.
- User state remains in browser `localStorage` unless manually exported.

## Remaining Risks

- External links leave the local application. Review destinations before opening.
- Browser extensions can observe local pages outside this project's control.
- ESPN's private web API is unsupported and may change without notice. Disconnect removes the retained cookies and dedicated Firefox profile.
- Local connector files are not application-level encrypted. Anyone who can read your operating-system account may be able to read them.
- A LAN/public deployment needs HTTPS, authentication, host allowlisting, firewalling, and filesystem protections supplied by the operator.
- A malicious local file can contain extreme values; numeric inputs are clamped, but imported projections are trusted as user-supplied data.
- Analyst rankings and player/team information change. Stale data is a decision-quality risk, not a code-execution risk.

## Verification

Run `node --test`, then inspect response headers from `http://127.0.0.1:4173` before use. No `npm install` or internet access is needed.
