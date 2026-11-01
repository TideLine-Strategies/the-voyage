# Calendar recurrence repair — November 1, 2026

Managed task: `790bb9166993`; baseline `5d63d4d85ad602a51ff1928081d1df18d98b06f9`.

An old daily event could disappear after 3,000 periods; `BYDAY=2MO` on a monthly event reused the original day of the month. The parser now seeks directly to periods intersecting the requested window, including duration and a wall-date/UTC margin. Finite COUNT uses arithmetic on repeating calendar patterns to account for historical occurrences without converting all historical dates through Intl. It counts excluded/overridden occurrences, skips invalid month dates, respects weekly WKST (Monday default), and compares UNTIL against the actual occurrence instant. Monthly BYDAY supports positive/negative ordinals and plain weekdays, sorted and deduplicated.

## Verification

- `node --test tests/ical.test.js`: 12/12 passed, including eight new regression groups. Literal expectations cover old daily series, intervals, exhausted/edge COUNT, second/last/fifth Mondays, weekly boundaries, UTC-date crossings, exact UNTIL, autumn DST, exclusions, moves, cancellations, overlapping events, month ends and century leap years.
- Seeked windows are compared with full expansions for finite daily, weekly, monthly and yearly series; the monthly case spans more than one Gregorian calendar cycle.
- `npm run check`: 251/251 tests passed. Actual workerd authentication test now also exercises the signed-in `/api/me/external-calendar` route with a synthetic provider feed: old daily series across autumn DST and November's second Monday returned correctly; the private subscription address was not returned. Actual two-task collaboration checks still pass.
- `scripts/audit-remaining-runtime.mjs` now asserts the corrected recurrence results while preserving unrelated open-defect assertions.
- All checks use isolated synthetic data. No external calendar account/subscription, production customer record, or event was modified.

## Limits and next review

This remains the existing small iCalendar reader, not a complete RFC 5545 engine. The scoped change does not implement yearly ordinal BYDAY, BYMONTH/BYMONTHDAY/BYSETPOS, RDATE, or full nonexistent/ambiguous DST wall-clock semantics. The existing output cap can select earlier feed masters before globally earlier events/overrides in another component; do not call a capped response complete. Unsupported RRULE fields remain an existing compatibility risk and should become an explicit provider capability/error contract rather than silently approximated. These are reasons CRM-09 remains partially repaired.

The entire current `src/ical.js` was reread for this repair, plus its calendar route and tests. That review is not a claim of exhaustive manual review of all CRM source. The historical coverage ledger and earlier check receipts remain baseline evidence; this file records the changed-file review and current acceptance.

Reference used: [RFC 5545 recurrence rules](https://www.rfc-editor.org/rfc/rfc5545#section-3.3.10).

Deployment is reconciled separately in the accepted CRM task report; passing local tests alone is not production acceptance.
