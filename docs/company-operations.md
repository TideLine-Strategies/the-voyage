# TideLine company operations

Voyage is the TideLine brand CRM. WonPlace, the TideLine website, Loki and Voyage
have independent analytics scopes. They are products of this brand, not permission
to import personal projects, unrelated entities or household expenses. There is
one TideLine financial ledger, with a required product tag on every row.

## What is implemented

Company navigation is editor-only. Its product selector changes the live feed,
provider snapshots and source analytics without combining their counts. Financials
show the full TideLine brand ledger with product attribution. Received revenue,
expected revenue, paid costs and bills due remain separate, grouped by currency.
Recurring bills are records, not payment mandates or automatic charges. Financial
edits check revision; imported records cannot overwrite a subsequent manual edit.

WonPlace's companion integration authenticates actual staff identities and emits
page visits, semantic write labels and visible activity heartbeats. No typed form
values, record contents, emails, screenshots, cookies or request bodies are sent.
This initial coverage is the explicitly configured staff organization. Parent
portal users and other tenants are NOT silently counted as zero or instrumented.

A hibernating SQLite Durable Object per product retains at most 2000 events for
seven days and pushes snapshots to viewers. Recent activity means a visible,
active session within 90 seconds. Viewer access is checked on each WebSocket
connection; the client reconnects after 55 seconds, stops offscreen and limits
failed reconnect attempts. No collection polling is added. Ingestion authenticates
method, path, body and timestamp with a distinct HMAC secret per product. Event IDs
are deduplicated. No company secrets are sent to the browser.

Spring keeps the canonical sanitized diagnostic events, incident grouping and
original request ticket IDs in WonPlace. Successful diagnostic uploads, failed
Spring runs and server exceptions push technical references into Voyage. The
signed source endpoint reads Spring diagnostics under its existing permissions,
plus this organization's 30-day AI execution receipts. Token counts are not spend.
Spring gains `analytics.product` for organization managers, disabled if the feed
is unconfigured. Muninn receives editor-only independent company context with
freshness markers. It does not gain permission to execute company writes.

Infrastructure errors outside instrumented app requests and missing telemetry
remain coverage gaps. Provider request/error summaries are not full log ingestion.
The older staff issue queue connection is PR #13, independent of Spring's newer
request/diagnostic queue; this feature does not replace either ticket record.

## Configuration and release

Deploy both reviewed companion changes through the managed coordinator. The
Voyage Worker uses `src/entry.js` to export CompanyHub, the `COMPANY_HUB` binding
and the additive `company-operations-v1` SQLite DO migration. D1 uses existing
`documents` for source links, provider snapshots and financial rows; no D1 schema
migration is needed. `TIDELINE_DB` is the existing tideline-contact database and
requires its already prepared site_events migration. Do not change account IDs.

The private connection manifest is prepared locally with the verified existing owner.
Run scripts/release-company-operations.mjs only via the coordinator; it validates
the exact provider revision, installs the prepared matching server signing keys,
and sends one initial provider snapshot. Real signed-in UI acceptance is a
separate mandatory receipt and is never inferred from HTTP status.

Set provider secrets only through this authorized managed release:

- Voyage: `WONPLACE_OPERATIONS_SECRET` for WonPlace ingestion/readback.
- WonPlace: matching `VOYAGE_OPERATIONS_SECRET`, plus
  `VOYAGE_OPERATIONS_ORIGIN=https://voyage.tidelinestrats.com` and the exact
  `VOYAGE_OPERATIONS_ORG`. Other organizations and read-only previews are excluded.
- Source diagnostics use the existing ticket connection configuration:
  Voyage's `WONPLACE_TICKETS_ORIGIN`, `WONPLACE_TICKETS_SECRET`; WonPlace's matching
  `VOYAGE_TICKETS_SECRET`, exact `VOYAGE_TICKETS_ORG` and active
  `VOYAGE_TICKETS_AUTH_ID`. That identity must retain agent.request, agent.approve,
  and org.manage or audit.read. Diagnostic visibility is not broadened.
- Other signed product producers each use their own server-only
  `TIDELINE_OPERATIONS_SECRET`, `LOKI_OPERATIONS_SECRET`, or
  `VOYAGE_OPERATIONS_SECRET` on the Voyage side.

Absent credentials are reported as unavailable, never connected. The release helper provisions the prepared matching signing secrets only inside
the coordinator deployment. A local dry-run verified the existing source owner
and required permissions; no new staff identity is created. No scheduled
collector or paid provider plan is activated. A link alone is explicitly labeled as a navigation link.

## Bounded provider reads and financial import

`node scripts/company-sync.mjs wonplace` reads the exact configured GitHub repo
and Cloudflare Worker once, using existing CLI credentials. `tideline` reads the
portfolio repository and go Worker (shared repository activity is not specific
to TideLine source paths); `voyage` reads the Voyage repo/Worker. Loki has no
independent Worker adapter yet; do not duplicate go's totals into Loki analytics.
Output includes statuses, coverage and metrics, never tokens. `--send` requires
COMPANY_SYNC_SECRET in the process environment and sends a signed snapshot to
Voyage. Nothing runs periodically. Use an approved execution environment for
fresh updates; GitHub and Cloudflare remain snapshots, not a claimed live stream.

`--financials /private/company-only.json` optionally imports at most 50 reviewed
business rows with stable id, product (tideline/wonplace/loki/voyage/tideline-other), kind
(bill/expense/revenue), status, positive integer amountCents, ISO currency and
calendar date. Optional recurrence is once/monthly/quarterly/yearly. Personal or
other-entity product tags are rejected. Do not feed a whole personal bank export.
Received means a source-confirmed receipt or owner-entered record, not a CRM deal
booking. This ledger is not reconciled bank evidence or payment authority.

## Acceptance

`npm run check` covers company isolation, guest denial, signing, redaction,
financial validation/idempotency and stale session handling. Run
`node scripts/verify-company-local.mjs` for a real local Durable Object/WebSocket
push, independent product scopes and revoked membership checks.

Live acceptance requires both exact deployed commits, configured source identities,
a real signed-in WonPlace page/action appearing in Voyage's WonPlace feed, no
appearance in TideLine/Loki/Voyage scopes, the same original Spring incident ID in
both apps (or a verified empty permitted incident queue), and a product-tagged business record staying out of personal sources.
An HTTP 200 or local simulation does not prove these production flows.
