# LinkedIn owner-session analytics acceptance

LinkedIn analytics collection now uses Quan's verified TideLine Super admin
session. YouTube retains its original channel session. LinkedIn never falls
back to Cody when Quan's window is busy, changed, signed out or contains a draft.

The runtime was installed against deployed revision
`a498a8389c91ba179c0d8e7c1b18e1c19a8e0cf8`. All eleven installed source files
matched that release. Its first installed run verified Quan's own profile
editing controls, captured TideLine Page Analytics Highlights, and confirmed
that the stored source observation matched the native capture. Meta, YouTube
and TikTok also completed their source reads and persisted readback checks.

Validation includes the owner-session source's 264 tests, real Worker checks,
the managed integration checks, native owner collection, exact-release runtime
installation and signed production readback. Detailed source captures and the
acceptance receipt stay in private operational storage; no account figures,
credentials or browser-session capabilities are committed here.

The existing daily schedule remains 08:15 local time while the owner Mac is
awake. Native reporting dates, immutable baselines, inherited legacy content
and missing metrics retain their existing semantics. The collector requires
the explicitly bound owner window and releases it without closing the session.
The one-time rollout follow-through is retired after acceptance.
