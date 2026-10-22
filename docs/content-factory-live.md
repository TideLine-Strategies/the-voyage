# Content Factory: real sources and gym-owner demand

The full-page workspace is `/factory/`, reached directly from Voyage’s Content navigation. It uses the existing session and editor role. Guests and anonymous requests cannot read its source data, assets or mutations. No new service, paid AI resource or database is created; the existing `documents` table stores editorial packages in `content_editorial`, with optimistic revisions and named activity. `content_baseline/linkedin` stores an immutable observed source baseline imported through the existing TideLine HMAC trust boundary. Generic collection APIs cannot write either collection.

## Current baseline and scope

The two actual TideLine company LinkedIn posts were observed in the authenticated Posts UI on October 22, 2026: the work around the class, and Training / Retaining. The raw captions and observation receipt remain in a private artifact, not Git or static assets. Exact publication times and reach are unknown. The old Mac queue still labels the second source as scheduled; that stale snapshot does not override the independently observed published baseline. Existing LinkedIn source-only routes remain source-only, preventing duplicates.

The live bundle has no demo seed, generated gym imagery, simulated media, simulated receipts, made-up metrics, localStorage authority or demo identity switch. The old demo seed, simulation, generated imagery and browser-store implementation have been removed from the working source; the separately preserved original export remains available for provenance. No post copy is prefilled. Research directions can become empty-copy working briefs; a team member supplies actual evidence, recordings and post copy.

## Useful content first

Current buyers: gymnastics and class-based gym owners, front-desk and admin staff. Current product: WonPlace, sold through TideLine. Start by testing three educational pieces for each product-proof piece, rather than treating this ratio as established fact. Priorities: parent progress updates, trial-family handoffs, repeated front-desk questions, attendance follow-up and disconnected operating records. Three blank usable worksheets are provided for immediate use without lead gating.

Eight research briefs and ten linked sources include industry and parent research, educational buying checklists, founder marketing examples and high-reach AI tutorials. Public comment/view counts carry observation dates and limitations. A high-view general AI tutorial is not proof of gym-owner buying intent. Vendor studies are labeled, and adult-fitness findings are not silently transferred to children’s programs. Keywords are grouped for owners, admin staff and future service-business partners. Source summaries are original analysis, not copied posts. Future products can be named in each editorial package without inserting fictional product campaigns.

## Editorial operation

Save the exact package before approval: audience, product, problem, immediate value, evidence, copy, media and CTA. Server-derived editor identity signs a SHA-256 package fingerprint; material changes invalidate approval. Missing evidence, final copy, value or CTA blocks approval. Concurrent writes return 409. A related existing CRM Account may be linked by ID. Accounts navigation opens the real Accounts view; no reaction, follower or comment is auto-created as a lead.

Posting is preparation only in this page. The existing publishing workflow retains dispatch authority, route checks, rights and independent provider receipts. This release does not activate new destinations, send social posts or authorize generated content. Muninn reads the actual baseline, saved editorial state and research via its existing editor-scoped context; it can help investigate and draft on request, without pretending to publish.

## Reproduce and release

Run `npm ci`, `npm run check`, then `npx --yes npm@11 ci --prefix prototypes/content-factory --ignore-scripts`, `npm run typecheck --prefix prototypes/content-factory`, `npm test --prefix prototypes/content-factory`, and `npm run build:live --prefix prototypes/content-factory`. Commit the generated `public/factory` assets; CI rebuilds and checks they match. A build assertion rejects the demo seed and generated imagery.

For local acceptance, set `CONTENT_BASELINE_FILE` to the private observation JSON and run `node scripts/preview-live-factory.mjs`. Open the loopback-only `/__local-review` route to establish a synthetic local review session. Its D1 is ephemeral, actual source exports are read-only, and outbound service calls are blocked. It is not production proof. Run `npx --prefix prototypes/content-factory playwright test --config prototypes/content-factory/playwright.live.config.ts` for desktop/mobile browser acceptance.

Production uses `scripts/release-content-factory.mjs` only through the managed coordinator after protected PR review and checks. Private environment paths provide the company configuration and baseline. The release imports both brand snapshots and the verified source baseline and installs the existing read-only five-minute snapshot exporter. It preserves current bindings and secrets. Reconciliation checks the active provider revision before import repair; it never blindly repeats deployment. Live verification requires an exact-revision signed-in UI receipt, including persistence, actual sources, approvals, stale-edit invalidation and responsive layout. Until that passes, report prepared/pushed, merged, deployed and live-verified separately.
