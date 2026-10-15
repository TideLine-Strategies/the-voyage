# WonPlace company ticket workspace

Company tickets is an editor-only Voyage view of WonPlace's original staff issue records. Open the page or click Refresh to fetch one bounded page. There are no timers or automatic subscriptions. A page includes up to 100 issues, with previous/next navigation. Details, attachments, and status updates use the original source ticket UUID, never a duplicate CRM note.

The source integration is implemented in the WonPlace companion PR (`server/voyage-tickets.js` and `docs/voyage-ticket-connection.md`). Both releases and server configuration must be present before the workspace connects. Missing configuration displays an explicit connection error. This does not depend on the pending analytics dashboard PR.

Configure these server-side values through the existing Cloudflare secret/config workflow:

- Voyage: `WONPLACE_TICKETS_ORIGIN=https://premieros-preview.signallabs.workers.dev` and secret `WONPLACE_TICKETS_SECRET`.
- WonPlace: matching `VOYAGE_TICKETS_SECRET`, exact `VOYAGE_TICKETS_ORG`, and `VOYAGE_TICKETS_AUTH_ID` for an active permitted source staff identity.

The source validates that identity's current organization and permissions on every request. The secret only authenticates the narrow ticket route. Browser sessions are not sent to WonPlace, and the secret is never sent to the browser. Attachment responses stream as authenticated downloads. Status changes include the PostgreSQL revision to reject conflicts/replays and record the signed Voyage member ID in the WonPlace audit trail. An ambiguous network failure never reports a successful save; refresh the source record before retrying.

Current coverage: all pages/statuses of `premier_staff_issue`. Separate parent beta feedback, assignment, additional comments, and general company project management are not implemented by this change. Existing source history and attachments remain in WonPlace.

## Quan, Cody and Instinct

Quan and Cody use their own existing editor sessions and the same Company tickets workspace. Guest access is denied. Instinct's official site describes website/computer use, but a public API/custom MCP integration was not verified. No third-party Instinct login, token, or permissions have been created by this change. Provision and verify each agent's individually attributable access before relying on it for business work.

A first read-only acceptance instruction is: “Open Voyage → Company tickets and summarize the open WonPlace issues, including ticket IDs. Do not change any records.” Verify the signed-in identity, actual source IDs, and report output separately for each agent. Do not share the server-to-server secret with either agent. Ticket access does not confer payment, production deployment, or external-send permission.

## Validation

Local unit tests cover guest denial, missing configuration, request signing, original actor identity, cookie exclusion, upstream conflicts/errors, and attachment streaming. Source-side tests cover tenant/permission boundaries, expired/tampered signatures, pagination, attachment redaction, stale writes and audit attribution. A synthetic in-memory end-to-end contract test exercised both real handlers together without writing customer data.

Authenticated live UI acceptance remains necessary after both releases/configuration and Cloudflare quota recovery. No new production ticket or fake customer data was created during implementation.
