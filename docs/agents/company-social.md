# WonPlace social measurement agent

This policy governs the read-only native TikTok collector and Company Social view.
The current account is `@wonplaceapp`, formerly `@floordstudios`. Its existing
persistent profile is still named `f100rd-tiktok`; this is a routing identifier,
not permission to publish F100RD content to WonPlace. Never publish, change the
profile, follow accounts, read messages, export cookies or reset authentication.

The first verified imported snapshot is the immutable growth baseline. We do not
know the historical rebrand date. Keep inherited follower/like totals and legacy
content separate from account growth since capture. Account growth is not proof
of gym-owner acquisition or attribution to a particular post. Do not manufacture
WonPlace-only cohorts from the handle change, caption keywords or relative dates.
Native post exports may contain only top posts, not a complete archive.

The reader claims the original profile using the installed account-access helper,
validates the exact admitted target and verifies the owner-visible Edit profile
control on `@wonplaceapp`. A draft or another browser owner defers the read. It
uses TikTok Studio Overview CSV for the seven source reporting dates, Followers
for the native net follower change, and Content CSV for lifetime post totals.
CSV account identity, exact dates, seven daily rows and sum-to-total agreement
are mandatory. Rounded profile counters remain unknown rather than approximate
exact counts. No undocumented platform API, browser storage or credential capture
is used. Source ZIP digests are retained with the observation.

Only the WonPlace signed source can ingest this account. Company APIs remain
editor-only. Baseline creation is insert-only; latest/day upserts require a newer
observation time. Replays cannot reset the baseline or replace newer data.
A failed refresh records its reason while preserving the previous source time.
Native calendar dates/timezone are kept separate from UTC website buckets.
Website clicks, customer conversions, watch retention and gated demographics
remain unavailable unless their own authoritative source is connected.

Daily capture runs at 08:15 local time while this Mac is available, and when its
LaunchAgent loads. Browser admission and the existing login remain prerequisites.
No cloud OAuth connection is implied. After 36 hours the capture is stale; report
calendar dates are always shown, including platform processing delay.

The living pass record is `last-sync.json` in
`~/Library/Application Support/TideLine/Social Analytics`, updated after every
attempt. `latest-source.json` and the evidence subdirectories retain source facts;
Company's signed readback is required before a run reports success. Do not print
source keys, profile storage, secure URLs or broad environment dumps. The runtime
holds no new credentials and uses the existing private scoped configuration.

Interpretation belongs to the existing Muninn Company workflow: pass validated
account totals, baseline changes, exact source dates and coverage to the LLM.
Keep qualitative recommendations distinct from measured facts. Platform account
selection, source parsing, eligibility and persistence remain deterministic.
The source is not authorized to spend money, send outreach or publish content.

If a source write has an uncertain outcome, reconcile with a signed read before
another attempt. A live runtime lock means another reader owns the run; wait.
A stale lock requires verifying the recorded PID is gone before removing only
that collector lock. Never remove browser profile locks or kill browser workers.

Validation for this implementation includes actual native export capture, signed
source isolation, baseline/replay/failure tests, exact release checks, live source
readback and visual review of the Company Social inspector. A new browser login
challenge is an owner handoff, not an excuse to replace the profile.

## WonPlace Meta accounts — owner confirmed November 2, 2026

Quan confirms the former F10.0RD accounts now belong to WonPlace. The native reader pins Instagram ID17841474678217484 and Facebook Page681105458418105. The returned Instagram handle is wonplaceapp; Facebook still returned the legacy display name. Display the returned identity; do not rename accounts as an analytics test. The existing Keychain connector remains private. Native follower/media counters are account totals, including inherited audience. They do not establish reach, conversions, or gym-owner identity.

The signed WonPlace source accepts validated socialAccounts snapshots for these two IDs only. Baselines are immutable, newer observations alone replace latest, and missing reads become stale rather than zero. The daily reader refreshes Meta independently before TikTok browser admission and verifies persisted readback. meta-last-sync.json retains the latest attempt. YouTube requires the original channel session; LinkedIn requires Page analytics permission. No browser cookies are converted into API credentials.

If the legacy helper picks an executed lease rejected by the broker, claim-social-analytics.py verifies the exact stale-resume rejection, rereads ownership, and claims only the unique free worker already bound to the exact TikTok profile. Changed ownership, unexpected errors and ambiguous responses hold the run. It never switches profiles or removes browser locks.

## Native YouTube and LinkedIn reporting

Read-only YouTube collection reuses the original Atlas profile used for the WonPlace rebrand, never a replacement Google account. LinkedIn uses Quan’s verified Safari session as specified below. Pin WonPlace channel UCSwOxf0QZOXpfrSjN46pm7A and TideLine Page 109054255. Obtain the governed controller for the exact lease and target. Page access is not publishing permission. A busy profile defers this step without blocking Meta or TikTok collection.

YouTube supplies precise subscriber and 28-day view counts; rounded watch hours are not imported as exact measures. Require the visible WonPlace channel name and exact native calendar range. Includes inherited floor-music content; no customer-interest inference. LinkedIn supplies follower count and Content Highlights only. Its content-engagement table can use a different date range; never sum it into Highlights, and leave clicks unknown until a matching report is captured. Hash private page evidence and validate the product-specific source before ingestion.

The page collector runs independently before TikTok in the existing daily job. page-social-last-sync.json records each attempt and any uncertain source write. Reconcile uncertain delivery by signed read before another capture. Existing baseline and latest observations remain intact on failed refresh and become stale after 36 hours. Evidence stays outside the public repository. The current account-access outcome is recorded in private runtime receipts, not in committed analytics figures.

All native browser collectors now obtain their controller from Agent Wall's governed gateway after exact lease/profile validation. The legacy helper's raw port is routing metadata, not authorization to attach. Resolve the gateway's explicit `/json/version` URL and verify its returned WebSocket stays on the same capability path; this also avoids a trailing-slash discovery rejection. Existing TikTok exports and source semantics are unchanged.

## Quan-owned LinkedIn session

After the owner completed verification, Quan and Cody were both granted Super admin on the TideLine Page. The daily LinkedIn source uses Quan's own exact Safari window through the shared queue, independently of Atlas. The private runtime file `linkedin-browser-binding.json` pins window ID, Quan's profile URL and the TideLine Page ID; it contains no credentials. Never silently fall back to Cody, copy login state, or switch a user's account.

Each pass verifies the current tab is the expected analytics page and has no draft, claims/checkpoints its exact window, opens Quan's own profile, requires owner-only profile editing controls, then reads TideLine's native Analytics Highlights. It releases the lease and preserves the original tab. Busy windows, changed tabs, login prompts, identity mismatches and yield requests defer collection while retaining earlier timestamps. A closed/replaced window requires an explicitly verified new binding. Native body captures and owner-profile proof stay private. YouTube retains its separate original Atlas channel session. No new OAuth integration is implied.
