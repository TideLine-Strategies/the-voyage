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
