# Audience and source connection pass

The Company canvas has an Audience tab with clickable source nodes, product switching, reporting windows/freshness, GA4 totals and channel mix, contact/waitlist receipts, and WonPlace landing-page totals. Existing charts, timeline, sidebar and inspector remain the navigation framework. Missing sources are labeled rather than inferred from another platform.

## Measurement boundaries

- TideLine GA4 uses its configured property and reporting timezone. First-party collection has its own consent coverage, rolling windows and UTC daily buckets. These sources are not interchangeable.
- Contact and waitlist submissions are alternative inquiry paths. An audit-start event is not an inquiry, customer, or booked conversation. All-time CRM pipeline records are separate from windowed acquisition events.
- WonPlace marketing sessions and page views are separate from app staff activity, provisioned staff accounts, and family/parent access. Collected events are not necessarily page views or unique people.
- The signed staff-access source returns aggregate current account statuses for its configured organization and authorized reader. Preview, audit-only readers, other organizations, and parent/family accounts remain excluded. Source deployment and exact live readback are separate release gates.
- Owner-confirmed former F10.0RD social accounts now belong to WonPlace. Identity is pinned to existing account IDs. Native followers and media include inherited audience/content. Instagram insight totals keep their exact source windows. Platform reach, website sessions, inquiries and received revenue cannot be summed into unique people or attributed sales.
- TikTok browser collection preserves the original profile and native export dates. Meta collection uses the existing private Keychain connector, independently of TikTok admission. Baselines are immutable; newer-only latest updates prevent stale overwrite. Missing refreshes retain their original observation time and never become fabricated zeros.
- YouTube needs authorized access to its original channel. LinkedIn Page analytics needs an authorized Page role. Public post observations do not establish private reach or click reports.

## Performance and verification

Chart hover coalesces events per animation frame and binary-searches sorted samples. This is a code-path optimization; no measured Core Web Vitals improvement is claimed. Anonymous HTTP probes hit the login boundary and are not authenticated CRM performance measurements.

Validation covers synthetic desktop/mobile behavior, scoped source ingestion, permission and preview denials, account identity, retained baselines and stale update rejection. Managed integration, deployed revision, installed collector identity, signed readback and signed-in UI verification are recorded separately in private CRM task reports.

Account-specific measurements, private captures and provider receipts belong in the authenticated CRM and private runtime evidence, not public repository documentation. Current documentation is sanitized; earlier Git revisions are historical and have not been rewritten.
