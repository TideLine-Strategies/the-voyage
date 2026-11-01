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
