# Audience and speed pass

The existing Company canvas now has an Audience tab with six clickable source nodes, product switching, source windows/freshness, live GA4 totals and channel mix, contact/waitlist receipts, and WonPlace landing-page totals. Existing charts/timeline, sidebar and inspector remain the navigation framework. Missing sources are labeled rather than inferred from another platform.

Live read-only observations on November 1, 2026:

- TideLine GA4 property 560552440 connected under q.stewart@tidelinestrats.com: 11 active users, 14 sessions, 20 page views over 30 reporting days; 12 direct and 2 organic-search sessions.
- TideLine acquisition: 36 collected first-party sessions, 69 page views over rolling 30 days, 0 contact submissions, 0 waitlist signups, 1 audit-start event. One all-time linked CRM account and no linked won deals. Different day boundaries and collection coverage explain why this is not interchangeable with GA4 or the canvas sum of UTC daily buckets.
- WonPlace landing-page collection: 125 sessions, 215 page views over rolling 30 days. Preview 203 events, home 113, product 14, Spring 2. Events are not page views or unique people.
- WonPlace source diagnostics are reachable. Historical /api/product-analytics errors exist; this is not proof of current app-user/access counts. An authoritative enabled/invited organization roster and returning-user reporting remain unconnected.
- TikTok native observation support exists. LinkedIn has public post observations; Page reach/click access remains a connection gap. Instagram/Facebook/YouTube reach are not wired into this canvas. No deduplicated cross-platform audience or inferred visitor identities are claimed.

Speed: chart hover was scanning every sample on every pointer event. It now coalesces events per animation frame and searches the sorted series logarithmically. This is a code-path optimization; no measured Core Web Vitals improvement is claimed. DevTools could not attach because its existing profile was already running; it was preserved. Anonymous HTTP probes hit the login/auth boundary and are not authenticated CRM performance measurements.

Next: connect authoritative app access/activation and per-brand social reporting; add explicit owner-approved conversion definitions and UTM-to-consented-inquiry attribution. Do not equate views, followers, sessions, active users, CRM accounts, or cash received. Retain source dates, privacy coverage, and freshness.

## November 2 connection pass

Original queued task a609dab4bc27 merged as18c5febc177d72876db3de6e8115d94f33c0c746 and deployed. Clean managed integration passed251 tests, workerd checks and Factory checks; synthetic Audience desktop/mobile passed. The earlier overlapping local test attempt ran before dependency installation completed and failed module loading; it is not the successful integration receipt. Signed-in live Audience readback and retained capture1837bc28db1540fd89e6b09b744a0261.png verified current GA4 and inquiry figures.

Quan confirms former F10.0RD socials are now WonPlace. Exact existing IDs were verified through the existing Keychain API connector: Instagram17841474678217484 returned wonplaceapp (487followers,120media); Facebook681105458418105 returned legacy display name F10.0R’d Studios LLC (52followers). Native Instagram total-value last30-day insights returned reach785,views1289,profile-link taps0. Each report retains its own exact timestamps. The inherited audience/content is included; this is not proof of gym-owner acquisition. TikTok refresh persisted and read back37followers and69views forOctober25–31.

The dashboard now consumes aggregate enabled/invited staff counts from the existing signed source when available. Companion WonPlace task044ac7aaa481 / PR636 adds tenant-scoped counts with org.manage and no roster/credential exports. Source deployment/readback remains separate. YouTube's existing Atlas profile binding mismatch and unavailable LinkedIn admin route require account handoffs; no replacement profiles or extracted browser credentials were used.

The Meta refresh runs before TikTok admission and retains independent attempt state; baseline inserts and newer-only updates preserve source history. Native counters and insight units/windows are separate from website sessions, parent activity, inquiries and received revenue. Unknown platform fields stay unavailable.
