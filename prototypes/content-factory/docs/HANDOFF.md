# Completed frontend prototype

Recovered and completed on 2026-10-22. Source: **Voyage Content Factory**, Lovable project `fc30d38a-deb4-4fbe-92b3-2d0c34902868`.

## Delivered

- All 98 original files recovered, checksummed and archived. Original brief, approved Concept C image and Lovable's partial-build notes are preserved alongside the completed source.
- Main page assembled with the slim Voyage sidebar, two-brand filter, responsive 3D coverflow, keyboard/direct selection, demo user switch, global stop, new idea and reset controls.
- Selected-item cockpit, editable brief/script/captions/schedule/destinations, version history, scene thumbnails, storyboard playback and activity trail.
- Final-package human approval and change requests, stale approval details, per-platform delivery states and simulated receipts, independent failure/retry, source-only company LinkedIn and visibly held TideLine routes.
- Analytics views and range/platform filters, honest missing metrics and platform rates, qualified outcome examples and insight-to-brief provenance.
- Restored strict unchecked-index and exact-optional checking. Fixed destination-account and scene/version fingerprint gaps, brief-only edits, post-publication re-approval, missing video/footage checks, privileged patches, unconfigured-route advancement, stale steering responses, corrupt local storage and unsaved approval guards.
- A dedicated prototype deployment config and build verification prevent inheriting the parent CRM Worker, domain routes or bindings; local production preview uses the compiled Worker.
- Self-hosted fonts; no external page requests in desktop/phone checks. No CRM, social or AI service is connected.

## Review and verification

`npm run typecheck`, 33 unit/rules/storage/routing checks, 14 Playwright scenarios across desktop Chromium and mobile WebKit, production build and local preview verification. Tests include refresh persistence, brand selection/new ideas, Cody approval, stale edits, steering/global stop, analytics/insights, keyboard/direct selection, mobile overflow and unresolved footage.

The app starts paused so the initial pipeline remains inspectable. Resume explicitly for simulated progression. Reset restores all seeded stages and clears edits. The You/Cody switch and local state are demonstrations, not production authorization.

## Next: attach to the existing CRM

This remains a separate prototype under `prototypes/content-factory`; the live Voyage navigation, database, permissions, publishing worker and website are untouched. Reconcile the separate Voyage PR #24 Content adapters during integration. Map the UI into the existing Content page, preserve current authenticated editor identity and audit permissions, and add server-side immutable package approval plus dispatch-time approval, stop, timezone and due-schedule checks, independent provider receipts and reconciliation. Existing unconfigured destinations must remain held until separately connected.

The prototype adapter intentionally rejects live mode. No live publication or AI execution is implemented, and no provider credentials or paid backend were provisioned.

## Provenance

GitHub sign-in was restored to `quanbuilds`, but Lovable retained the old account mismatch. The complete source was recovered via authenticated UI exports rather than a Git clone. Original checksums and recovery methods are recorded in `lovable-source-export.jsonl`; the original Bun lock is retained as `lovable-original.bun.lock`. Use the finished npm lock to reproduce this app.
