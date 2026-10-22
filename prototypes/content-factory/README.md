# Voyage Content Factory

A complete, standalone **frontend prototype** recovered from Lovable project `fc30d38a-deb4-4fbe-92b3-2d0c34902868`. It preserves the approved Concept C direction and the original carousel, cockpit, typed models and imagery. The main page, package approval, analytics and working demo controls are finished locally.

## Run

Use Node.js 22.12+ and npm 11. No API keys, cloud database, social account or paid AI service is required.

```sh
npx --yes npm@11 ci --ignore-scripts
npm run dev -- --port 5196 --strictPort
```

Open `http://127.0.0.1:5196/`. The demo starts paused with 14 items, two brands and two pieces in each stage. **Resume factory** runs the simulated loop; **Pause factory** stops progression and dispatch. The state is saved in this browser under `voyage-content-factory:v1`. **Reset demo** restores the seed.

The finished version uses `package-lock.json`. The original Bun lock is preserved at `docs/lovable-original.bun.lock` for provenance.

## Review it

1. Select WonPlace or TideLine; select a card or stage, or use the carousel arrow keys.
2. Create a specific idea. Refresh and verify it remains in Research.
3. Open Script, change the hook and save. Unsaved changes block approval and switching items.
4. Steer Muninn with a direction. It records the human instruction, pauses the item and returns a clearly simulated plan. Resume explicitly.
5. Send an item to human review. Inspect the exact video version, six captions/destinations, schedule and thumbnail. Select You or Cody and approve.
6. Change the saved package after approval. The prior approval becomes stale and the item returns to review.
7. Resume the factory to watch independent simulated platform states. WonPlace X deliberately fails once and supports retry; existing successful receipts remain intact. TideLine's unconfigured routes stay held, and its company LinkedIn source is never re-posted to itself.
8. Change analytics date/platform filters, compare platform-specific rates, and create a Research brief from an insight with provenance.

The storyboard player previews illustrative scenes and overlays; it does not render a video. Footage upload is explicitly simulated and sends no file or message. All publishing receipts, example dates, account connections, outcomes and metrics are illustrative.

## Validate

```sh
npm run typecheck
npm test
PLAYWRIGHT_SKIP_BROWSER_GC=1 npx playwright install chromium webkit
npm run test:browser
npm run build
npm run preview -- --port 5197
```

Strict TypeScript includes unchecked-index and exact-optional-property checks. The test suite covers the approval fingerprint, privileged-edit rejection, pause/dispatch gates, unresolved footage, independent receipts and retry, local persistence validation, analytics filters and desktop/mobile flows.

## Integration boundary

This app is **not attached to the live CRM**. The dedicated prototype Wrangler config prevents inheriting the parent CRM Worker name, routes or bindings; the production build checks this isolation. No API calls publish, send outreach, write CRM records or invoke paid AI. Fonts and media are local assets. The You/Cody switch is a demo control, not authentication. `FactoryProvider` rejects live adapters.

`src/features/content-factory/services/adapter.ts` defines local persistence and steering seams. Before live integration, replace these with authenticated Voyage reads and typed server commands; approve an immutable package hash/revision on the server using the existing editor identity and audit/permission system. Dispatch must re-check that approval, stops, the timezone-aware due schedule, route ownership and provider readiness. Use the existing publishing worker's receipt/reconciliation model and reconcile the separate Content-source work in Voyage PR #24. Never trust browser storage, the demo user switch or simulated receipts as production authority.

## Recovered sources

- `docs/lovable-original-brief.txt`: full original build brief.
- `docs/approved-concept-c.png`: approved reference image.
- `docs/lovable-handoff-before-local-completion.txt`: Lovable's exact partial-build handoff.
- `docs/lovable-source-export.jsonl`: original file checksums and export methods.
- `docs/HANDOFF.md`: completed work and the next CRM integration step.

All 98 original source files were recovered through the existing authenticated Lovable UI. Git sync retained an old account mismatch, so the recovery used file downloads, the UI's Copy file content action with rendered-prefix verification, and rendered image data. No account permissions were expanded. The original 98-file archive is kept separately from this finished version.
