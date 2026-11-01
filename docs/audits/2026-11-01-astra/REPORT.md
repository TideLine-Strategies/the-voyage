# Voyage CRM audit — Astra execution handoff

Audit date: 2026-11-01. Task: `466de0cefb56`. CRM tracking ticket: `a746a53a-7f1e-47eb-a979-461a74194b90`.

**Pinned source:** `eda8dfb094dddba0664de4ad6d376f5b27664edb` (the deployed revision at audit start). All line references below refer to that baseline. Rebase/reinspect before implementing; later changes may invalidate a finding.

## Decision and scope

Start with draft preservation, concurrent-write protection, schemas and background request control. These affect the reliability of everyday human/agent collaboration. This report contains 20 actionable findings, with source evidence and acceptance checks, not a claim that all are presently observed production incidents. No P0 exploit was established. No application source was repaired or deployed by this audit.

The baseline inventory covers **343 tracked files and 37,870 text lines**: 176 first-party source files, 67 test/verification files, 46 UI wrapper files, 25 documentation files, 12 generated/lock files, 9 migrations, 5 binary assets and 3 historical import evidence files. Every tracked file was byte-read and hashed, lexical candidates were indexed, and Python files were syntax parsed. See `inventory.json`; candidate matches are not vulnerabilities.

**Coverage limitation:** byte coverage is complete; manual semantic review is not a certified every-line review of all 37,870 lines. The main Worker routing/auth/authorization/document handlers, Company integrations, content pipeline, ticket/agent flows, calendar code, nine migrations and the high-risk browser mutation paths received detailed source review. Generated bundles, lockfiles and vendored UI wrappers received inventory/dependency inspection, not independent semantic reconstruction. Portions of the large legacy HTML/CSS/deal UI, auxiliary installation/release/verification scripts, React presentation code and historical documentation were mechanically scanned rather than exhaustively manually traced. Astra must finish those lower-depth areas and record per-file coverage before calling this an exhaustive line-by-line audit. Do not convert this report into an assurance that unlisted files are defect-free.

## Evidence and reproduction rules

- `client-probes.mjs` executes the actual DB adapter and extracted note-save function in a synthetic VM. Its checked-in JSONL records prove CRM-01, CRM-05 and the own-profile path of CRM-06.
- `scripts/audit-crm-reproductions.mjs` bundles the actual Worker in local Miniflare, applies all migrations to an ephemeral D1 DB and uses synthetic records. Outbound network is denied. It exercises stale updates, invalid schema/relationships, pagination, authentication, cross-product finance and recurrence. See the validation record for whether this run actually completed.
- These are **defect-demonstration probes**: several assertions expect the broken baseline behavior. After repair, convert each into a meaningful positive regression test rather than keeping a passing assertion that the bug still exists.
- The existing root check passed 230 tests. Passing that suite did not detect these defects. Additional checks and their actual results are in `VALIDATION.md`.
- No production record was mutated for a reproduction, no provider charge or social publication was attempted, and no credentials/customer record contents are included. Audit-time task counts are a local operational snapshot, not billing evidence.

## Execution contract for Astra

Read root/project AGENTS.md, CLAUDE.md and `/Users/stewartos/.agent-workspaces/PROTOCOL.md`. Start a registered isolated worktree for each repair batch; renew ownership and run heavy checks through `resource-run`. Shared checkouts are read-only. Do not merge your own branch, push main or directly deploy. Submit exact commits through the managed coordinator, retaining branch protection and independent review where required.

Reconfirm each finding against current main before changing it. Keep baseline tests red for the right reason, implement the narrow fix, and make acceptance tests pass. Preserve customer/financial data and source provenance. Do not bulk rewrite malformed historical rows without a reviewed migration and rollback. Keep payment activation, credential/MFA interaction, account changes and social publication outside test runs. Human approval/acceptance must never be forged.

For deployed changes, distinguish local tests, integration, merged commit, deployed revision and authenticated owner-flow readback. A build, green HTTP response or connected badge is not full acceptance. Attach evidence to the relevant Company ticket and retain unresolved live gates.

## Ordered repair batches

| Order | Scope | Findings | Required proof |
|---|---|---|---|
| 1 | Preserve user work and bound noise | CRM-01, 04, 05, 06 | Failed-save fixtures, session/guest matrix, measured idle/terminal request counts |
| 2 | Core data integrity | CRM-02, 03, 07 | Two-client races, merged schemas, >2,000-row pagination/export and >500-fact totals |
| 3 | Business workflow reliability | CRM-08, 09, 10, 11 | Fault injection, recurrence fixtures, bounded bodies, source capability matrix |
| 4 | Persistent agent bridge | CRM-12, 13, 19 | Long logs, crash/ack boundaries, real direct-task projections |
| 5 | Content evidence and publishing integrity | CRM-14, 15, 16, 17 | Feature-specific synthetic captures, uncertain-dispatch reconciliation, destination binding, stable citations |
| 6 | UI and supply-chain closure | CRM-18, 20 | Draft selection/back/refresh checks, dependency reachability and complete Factory checks |
| 7 | Audit closure | Remaining low-depth files | Per-file manual review ledger, additional findings or explicit rationale, current-head rerun |

Batches are scopes, not permission to bundle unrelated fixes into one PR. CAS/schema changes require coordinated server/client compatibility; do not roll out a server precondition that silently breaks old open tabs. Pin evidence to each reviewed revision. A financial source authority decision may require confirmation of intended aggregation, but routine source review/testing can continue independently.

## Findings

### CRM-01 · P1 · Failed note saves discard the only draft and create a phantom saved note

**Evidence level:** VM-reproduced. **Source:** `public/index.html:1554-1565`; `public/index.html:1360-1362`.

saveNote clears dirty state, removes nDrafts, adds a note to local saved state and renders before awaiting storage. write swallows the rejection. A VM executing the actual extracted function with a rejected save confirmed all three state changes. Other account/task forms close before receipt; logAct and lastTouch can advance independently of the actual change.

**Repair:** Keep the exact draft and editor open until an acknowledged durable write. Make write return a typed result or throw; update saved state and history only after success. Add navigation protection and a recoverable draft store with explicit discard. Apply the same receipt discipline to account, task and activity forms.

**Acceptance:** Offline, 403, 409 and 500 must preserve exact text and dirty state; no success history or lastTouch change. A successful retry saves once, clears the draft once and survives reload. Test existing-note and new-note paths.

### CRM-02 · P1 · Core CRM writes silently overwrite another editor or agent

**Evidence level:** local Worker/Miniflare reproduced. **Source:** `src/worker.js:884-946`; `src/worker.js:355-449`; `public/voyage-db.js`.

Core document reads do not expose a write precondition; PUT upserts and PATCH json_patch increment revisions without a compare-and-swap. A later stale full snapshot can restore old values. Workflow read/check/save sequences also lack atomic preconditions. Existing revision counters alone do not prevent this.

**Repair:** Expose authoritative revisions; require expectedRevision for updates and deletes; atomically compare it in D1. Return 409 with a safe current snapshot on conflict. Preserve the local draft and offer explicit merge/reload. Apply separate CAS guards to workflow transitions and idempotency keys to retries.

**Acceptance:** Two clients load revision N: first save succeeds; stale second save returns 409 and cannot change any field. Repeat through both PUT and PATCH and simultaneous deal transitions. A conflict never silently closes an editor.

### CRM-03 · P1 · Core document validation accepts corrupt types and inconsistent relationships

**Evidence level:** local Worker/Miniflare reproduced. **Source:** `src/worker.js:118-163`; `src/worker.js:454-483`; `src/worker.js:70-79`.

Validation is incomplete for opps, activities, activity, notes and channels. Existing location restrictions are effective, but arbitrary account name types and out-of-range stages are not similarly rejected. Contact PATCH truncates email without create-time format validation. Activity PATCH can change oppId without rechecking the retained contact. Stored data.id can also override a mapped authoritative ID in consumers using {id,...data}.

**Repair:** Define explicit bounded schemas and writable fields per collection and role. Validate the merged post-update record; keep identity fields server-owned. Validate account/contact ownership whenever relationships change. Inventory existing invalid rows read-only; quarantine or explicitly migrate them rather than blindly coercing records.

**Acceptance:** Reject object names, invalid stages/email/dates, spoofed IDs and cross-account contact links with no mutation or audit success. Positive guest profile/contact cases still work. Render all known historical variants without crashing.

### CRM-04 · P1 · Idle panels and terminal tasks keep consuming background requests

**Evidence level:** source-confirmed. **Source:** `public/company-tickets.js:70-112`; `scripts/ticket-task-progress.mjs:31-47`.

The 2.5-second embedded-agent poll checks connection/closed state but not page visibility, hidden panel, terminal state or offline/backoff. Hiding or removing the panel does not consistently perform the same close cleanup. Task progress re-posts unchanged linked terminal tasks at least once per minute. Audit-time local inventory had 113 complete/cancelled links; their cadence permits about 162,720 terminal POSTs/day if continuously awake. This is an estimate, not measured billing. One continually polled panel permits 34,560 reads/day.

**Repair:** Centralize panel lifecycle cancellation; suspend hidden/offline/terminal work, back off errors and resume on visibility/user action. Send terminal task progress once per substantive transition/report, not periodic heartbeats. Prioritize active work with bounded concurrency/batches and observable queue latency.

**Acceptance:** Thirty hidden minutes produce no panel polling; an unchanged terminal task produces no repeated POST. Reopening refreshes once. Large terminal history and a slow failed request must not starve an active task. Verify provider request counts before/after.

### CRM-05 · P2 · Expired sessions retry instead of entering an explicit sign-in state

**Evidence level:** VM-reproduced. **Source:** `src/worker.js:988`; `public/voyage-db.js:22-44`; `public/voyage-db.js:77`.

Unauthenticated API requests return 403; the adapter special-cases 401/429 and drops the HTTP status for generic failures. A VM with the actual adapter confirmed undefined error.status and another protected request after backoff.

**Repair:** Define a consistent authentication failure code/status, preserve HTTP status and structured errors, stop protected polling on session expiry, and offer sign-in without dropping drafts. Keep permission-denied 403 distinct from expired authentication.

**Acceptance:** Expired sessions cause one clear reauthentication state and no retry storm; an authorized user denied one resource does not get logged out. After sign-in, preserved drafts and subscriptions resume safely.

### CRM-06 · P2 · Guest profile/contact edits disagree between client and server

**Evidence level:** VM-reproduced. **Source:** `public/voyage-db.js:53-64`; `src/worker.js:70-79`.

The server permits a guest to patch their own profile and existing contacts; checkGuestWrite blocks those collections. The actual adapter VM confirmed own-profile edits fail locally before the permitted server operation.

**Repair:** Use a shared permission contract or accurately mirror the server matrix. Retain the server as the authority. Do not broaden guest create/delete, vendor, deal or other-member permissions.

**Acceptance:** A guest edits their own profile and permitted existing contact; cannot edit another profile, create/delete restricted records or alter protected account location data.

### CRM-07 · P1 · Collection limits silently hide older records and make exports incomplete

**Evidence level:** local Worker/Miniflare reproduced. **Source:** `src/worker.js:884-892`; `public/voyage-db.js`; `public/index.html:2028-2037`; `src/company-ops.js:28`.

Generic collection reads cap at 2,000 without continuation/hasMore; clients treat the result as the collection. CSV exports use those loaded arrays. Company records independently cap at 500, so financial totals can eventually omit older rows. Some sales UI warns about partial data, but this is not a consistent contract.

**Repair:** Implement stable cursor pagination and server-side filtering/search. Export and financial aggregation must cover the authoritative requested range independently of a UI page. Surface partial coverage and total/asOf explicitly.

**Acceptance:** Seed 2,001 core records and 501 financial facts. Every record is discoverable; export counts and aggregate totals match SQL. Updates during paging cannot duplicate/skip records, and partial reads never masquerade as complete.

### CRM-08 · P2 · Multi-record deal and sequence transitions can partially commit or duplicate work

**Evidence level:** source-confirmed. **Source:** `src/worker.js:355-449`; `src/worker.js:506-615`; `src/worker.js:645-679`.

Winning/reopening a deal mutates an account before saving the deal. Sequence scheduling/enrollment/task completion spans independent writes and catches some hook failures after completion. File chunks and metadata are written/deleted separately. A mid-operation failure can leave divergent account/deal state, duplicate/missing follow-up work or orphaned chunks.

**Repair:** Use D1 atomic batches where possible, unique logical operation keys, CAS state transitions and a durable outbox for recoverable follow-up work. Distinguish failed from uncertain external delivery. Add bounded orphan reconciliation without deleting referenced evidence.

**Acceptance:** Inject a failure after every statement and retry concurrently. Either all business invariants commit or a durable recoverable operation remains. Exactly one next task/enrollment; signed evidence remains accessible; no false won/complete state.

### CRM-09 · P2 · Recurring calendar events can disappear or land on the wrong day

**Evidence level:** local Worker/Miniflare reproduced. **Source:** `src/ical.js:62-110`.

Recurrence iteration starts at DTSTART with a 3,000-step ceiling. A daily series beginning in 2000 has no November 2026 occurrence. Monthly expansion does not implement ordinal BYDAY: a series beginning 2026-10-12 with BYDAY=2MO moves to November 12 rather than November 9.

**Repair:** Use a standards-tested recurrence implementation or explicitly reject unsupported rules. Seek to the requested window before bounded expansion. Preserve timezone, EXDATE and recurrence override/cancellation semantics.

**Acceptance:** Cover old daily series, second-Monday monthly rules, BYSETPOS/BYMONTH support or explicit unsupported status, DST boundaries, all-day events and cancelled exceptions. Availability must not silently treat an unsupported series as free.

### CRM-10 · P2 · Response-size guards allocate the entire body before rejecting it

**Evidence level:** source-confirmed. **Source:** `src/worker.js:299-302`; `src/worker.js:645`; `src/worker.js:715-717`.

Audit labeling parses a cloned JSON body before bounded handling; file upload uses arrayBuffer before its size check; calendar fetch follows redirects and buffers text before its cap. These limits do not bound peak allocation. Redirect handling also deserves destination revalidation; no private-network exploit was established in this audit.

**Repair:** Validate origin/authorization before parsing. Use streaming byte limits with cancellation, bounded decoding and explicit redirect policies. Revalidate every redirect destination according to the intended source allowlist; limit decompressed response bytes as well.

**Acceptance:** Chunked oversized bodies abort at the configured bound without a whole-body allocation or DB write. Unauthorized bodies are not parsed. Redirect and oversized calendar fixtures fail safely; ordinary uploads still work.

### CRM-11 · P2 · Product-scoped source secrets can write cross-product finance facts

**Evidence level:** local Worker/Miniflare reproduced. **Source:** `src/company-ops.js:19-25`; `src/company-ops.js:108-123`.

Signed ingestion authenticates a company source, but financialRecord permits every TideLine product and ingestion stores into the common ledger without binding product to the authenticated source. A Loki source can therefore submit a Voyage revenue fact. This is an internal capability boundary, not an anonymous endpoint exploit.

**Repair:** Define the intended authority explicitly: bind each product source to its product, or issue a separate documented brand-finance capability for legitimate aggregation. Namespace source-owned IDs and preserve manually edited facts. Do not connect payment permissions as part of this repair.

**Acceptance:** A product source cannot insert/replace another product financial fact; an explicitly authorized brand ledger import can. Replays are idempotent and manual corrections remain protected.

### CRM-12 · P2 · Long-running agent conversations freeze on the first 2 MiB of log

**Evidence level:** source-confirmed. **Source:** `scripts/ticket-operations-server.mjs:38`.

The reader allocates at most 2 MiB but reads from position zero. Once the log exceeds that size, new deltas and command receipts never enter the returned transcript.

**Repair:** Tail a bounded range on complete record boundaries; keep thread/control metadata in separate durable state so tailing does not lose initialization. Expose truncation and last durable event cursor.

**Acceptance:** A log over 2 MiB shows the newest message/status/ack while retaining correct thread metadata. Partial trailing lines, UTF-8 boundaries and rotation are safe.

### CRM-13 · P2 · Agent bridge can lose commands and misclassify a normal exit

**Evidence level:** source-confirmed. **Source:** `scripts/ticket-codex-session.mjs:23-29`.

process.exit(code||1) maps a normal child exit 0 to failure 1. A queued command is renamed .accepted before the RPC executes; a crash in that interval leaves it looking consumed without a durable provider acknowledgement.

**Repair:** Preserve zero exit codes and explicitly represent signal termination. Introduce processing/acknowledged/uncertain command states with durable operation IDs and provider reconciliation. Never blindly replay an uncertain message or interrupt.

**Acceptance:** A stub child exit 0 is success and nonzero/signal remains failure. Crash at each command boundary: no silent loss, no duplicate message, and the UI distinguishes queued, accepted, failed and uncertain.

### CRM-14 · P2 · Autonomous filming does not follow the approved issue or shot list

**Evidence level:** source-confirmed. **Source:** `scripts/content-production-pass.mjs:17-23`.

WonPlace/Spring requests use the same short Schedule-to-Families capture recipe regardless of the saved pain point, feature claim or proposed shot list. A changed title overlay does not prove the requested product capability.

**Repair:** Resolve each brief to a verified feature/route/action/result capture recipe. Consume the shot list and preserve a capture manifest with product revision, route, actions, assertions and privacy-safe evidence. Hold unsupported shots rather than substituting generic footage.

**Acceptance:** Two materially different feature briefs produce matching, distinct actual demonstrations. Unsupported claims stay held. Test with synthetic families and no customer PII; do not publish during validation.

### CRM-15 · P2 · Publisher acceptance followed by sync failure leaves an unreconciled campaign

**Evidence level:** source-confirmed. **Source:** `scripts/content-production-pass.mjs:39-43`; `src/content-production.js:13-19`; `src/content-production.js:28-37`.

Native intake can succeed before content snapshot synchronization and production_complete. If the latter steps fail, production_fail holds the job without linking campaignId to the editorial item. Publication reconciliation depends on that link, so an accepted or later published campaign can remain stranded.

**Repair:** Persist a dispatch intent and deterministic source key before intake; retain accepted campaign identity independently of later sync. Reconcile the publisher by identity after ambiguous failures before allowing any retry. Resume linkage from durable receipts.

**Acceptance:** Fault-inject after intake acceptance and before each later step. Recovery links exactly the accepted campaign and publication receipt with no second dispatch. Unknown acceptance remains visibly uncertain, never automatically republished.

### CRM-16 · P2 · Approval verifier does not bind the actual publishing brand/destination

**Evidence level:** source-confirmed authority gap. **Source:** `src/content-production.js:7-9`; `scripts/voyage_authority.py`.

production_verify compares current stage, package fingerprint, media and copy, but ignores the dispatch row brand/profile/destinations. The local manifest check compares local values with each other rather than server-authoritative destinations. A relabeled local row can pass the current copy/media check. Normal current producer behavior does not demonstrate an actual wrong-brand publication.

**Repair:** Return and verify the authoritative approved brand and exact destination profile identifiers, along with the full approved package hash and current revision. Reject unknown or relabeled queue fields before dispatch; preserve human approval provenance.

**Acceptance:** Changing only brand, profile, platform or destination after approval is denied before intake. Exact approved destinations pass. Synthetic queue tests must not send to real social accounts.

### CRM-17 · P2 · Analytics evidence identifiers collide across ingestion runs

**Evidence level:** source-confirmed. **Source:** `src/content-platforms.js:83-123`; `prototypes/content-factory/src/live/OperationsPanel.tsx:200-208`; `src/content-ops.js:50-55`.

Persisted observation value IDs use platform-brand-accepted, with accepted reset for each request, while DB row keys hash the URL. Separate one-post runs can therefore store different URLs under identical evidence IDs. Maps and LLM citations using those IDs can resolve to the wrong post.

**Repair:** Use a stable brand/platform/canonical-URL identity; deduplicate and migrate existing references with provenance. Validate globally unique evidence IDs before decision input assembly.

**Acceptance:** Two one-post ingestion runs produce two distinct stable evidence IDs and correct links. Reingesting the same post preserves identity and latest-known metric semantics; stale decisions retain their original evidence snapshot.

### CRM-18 · P2 · Factory selection and CRM navigation can diverge from what is saved or in the URL

**Evidence level:** source-confirmed. **Source:** `prototypes/content-factory/src/live/StationBoard.tsx`; `prototypes/content-factory/src/live/LiveFactoryPage.tsx`; `public/index.html:3016-3030`; `public/index.html:3172`.

StationBoard updates its local selection before the parent may reject selection because of an unsaved draft. Separately, go changes CRM views without updating history, requestedView is only initial state, and there is no matching popstate routing contract. Refresh/bookmark/back can open a different view from the one displayed.

**Repair:** Make selection controlled or commit it only after parent acceptance. Centralize route state, URL history, product/ticket selection and draft guards. Background agent presence must never steal the human selected ticket or composer.

**Acceptance:** Cancel a dirty-card switch: editor and highlighted card remain the same. Every CRM tab has a stable refresh/back/forward deep link. Dirty drafts and the persistent agent composer survive navigation according to explicit user choice.

### CRM-19 · P2 · Autonomous-work summary omits directly managed agents

**Evidence level:** source-confirmed. **Source:** `public/living-crm.js:10`; `src/ticket-task-progress.js`; `src/ticket-job-queue.js`.

The living CRM classifies running work from recent codingJobs. Tasks created directly through agent-workspace are visible in task progress/collaboration but have no codingJob, so the operations summary can call them next work instead of active. This is a projection mismatch, not evidence that the agents are stopped.

**Repair:** Project from canonical task progress plus real presence, preserving source and freshness. Distinguish lifecycle working from actual tool/typing activity; do not invent active animation from heartbeats alone.

**Acceptance:** A directly linked managed task and a handoff-launched task appear correctly in the same running/blocked/done summary. Expired presence is not reported as live tool activity. Counts match source receipts without double counting.

### CRM-20 · P2 · Content Factory dependency graph has high-severity advisory exposure

**Evidence level:** source-confirmed. **Source:** `prototypes/content-factory/package-lock.json`; `docs/audits/2026-11-01-astra/factory-dependency-audit.json`.

The audit-time npm advisory result reports 20 affected packages: 6 high and 14 moderate, zero critical. These are affected-package counts, not unique CVEs. High entries include Vite, Wrangler, Miniflare, Undici, Sharp and Zod in the resolved graph. The root production dependency audit reports zero. Build/dev dependency exposure is not proof of a publicly exploitable deployed Worker.

**Repair:** Map each advisory to the actual build, preview and shipped runtime paths, upgrade compatible direct/transitive dependencies and remove unused prototype tooling where justified. Preserve lockfile reproducibility; do not run blind force upgrades.

**Acceptance:** Repeat both audits, typecheck, Factory unit/browser tests and live build verification; compare artifact behavior. Document any retained advisory with reachability and owner rather than claiming a clean result from excluding dev dependencies.

## Lower-priority observations and follow-up checks

- The admin screen describes invitation-only sign-in while password/Google authentication now exists; displayed session duration can also omit the shorter non-remembered session. Reconcile copy against the actual contract.
- Review cancellation/lease-expiry recovery of content agent runs, queue starvation at fixed SQL limits, relation deletion semantics, aggregate currency handling and stale metric coverage under failure. These are follow-up inspection areas, not independently proven findings in this report.
- Recheck all HTML sinks against data schemas and output escaping after schema changes. A lexical sink count alone is not XSS evidence. Preserve CSP and source/role separation.
- Provider analytics/account access, Trakr connectivity and social page permissions were not newly authenticated in this code audit. Do not interpret the report as verification of current external connectivity or financial reconciliation.

## Coverage closure required before “every line reviewed”

Use `inventory.json` as the pinned manifest. Add a semantic-review status and reviewer/evidence for every first-party file, remaining test/verification script and policy document; separately justify generated/vendored exclusions. Review the remainder of `public/index.html`, all standalone CSS and presentation components, install/release automation, archived prototype server routes and verify scripts. Trace each externally reachable route to authentication, origin/CSRF, validation, authorization, storage, audit and failure recovery. Follow all asynchronous fan-out paths and data rendered into HTML. Inspect migrations against fresh and upgraded D1 databases. Rerun dependency and generated-artifact checks at the implementation head.

The inventory intentionally records baseline bytes, not the new audit documents. If regenerated after this commit, store a separate current-head inventory rather than overwriting baseline evidence. Deliver fixes with their own evidence and leave this historical report immutable except for a dated validation addendum.

Official platform reference used in review: https://developers.cloudflare.com/workers/best-practices/workers-best-practices/ . Dependency advisory URLs and ranges are retained in the npm audit JSON artifacts; verify them again when implementing.
