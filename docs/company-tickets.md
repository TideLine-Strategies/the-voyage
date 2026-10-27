# Company → Tickets

Tickets live in the Company canvas and inherit its product selector. The old
`?view=tickets` entry opens this tab. The main CRM navigation has no extra ticket
page. Editors can create and edit engineering tickets for TideLine, WonPlace,
Loki and Voyage. Guests cannot read tickets or image bytes.

Fields: title, description/acceptance criteria, bug/feature/task/incident,
backlog/open/in progress/blocked/in review/resolved, priority, owner, due date,
labels, reproduction steps, expected/actual results, environment and HTTPS
issue/PR/release links. Notes record author and time. Activity records changes.
Search and status filters operate on all loaded pages; urgent tickets sort first.

WonPlace originals are read through the existing signed ticket connection.
Triage creates one Company engineering ticket per original report, using the
source UUID and a sourceId link. Workspace descriptions, notes, status and trash
are separate from originals and say so in the interface. Original report status
can still be changed explicitly through its original revision-checked API.
Deleting a Company ticket moves it into recoverable trash; restoring preserves
notes and screenshots. It never deletes the original staff report.

Screenshots use existing D1 documents storage, split from ticket metadata, with
PNG/JPEG/WebP byte signatures, a streamed request cap, 1 MiB per file, 10 files
per ticket, private no-store responses and authenticated viewing/downloads.
Screenshot removal deletes the stored image payload. Product and parent ticket
references are checked before image access. No new paid storage, public bucket,
credential, migration or external issue service is required.

All workspace writes require the expected revision. Child image changes and
parent revision updates use one atomic conditional D1 batch. Stale edits return
409 and the browser retains the draft. Creation uses a client-generated stable
UUID so an uncertain retry cannot create duplicate tickets. Notes are capped at
200 and the recent activity trail at 300 entries per ticket. Writes require the
existing editor membership and same-origin protection. Never put credentials,
private customer exports or payment details into engineering screenshots.

Validation: SQLite tests for CRUD, concurrent revisions, notes, trash/restore,
source ID deduplication, product isolation and image removal. Real workerd/D1
acceptance exercises image bytes, cookie authorization, origin rejection and
revision checks. Release additionally requires authenticated visual and live
create/edit/note/image/trash/restore verification, then removes acceptance image
bytes and leaves its clearly marked acceptance ticket in trash.

## Existing WonPlace source connection

Keep the existing server-side configuration: Voyage `WONPLACE_TICKETS_ORIGIN`
points to the intended WonPlace origin, with `WONPLACE_TICKETS_SECRET` matched
by WonPlace `VOYAGE_TICKETS_SECRET`. WonPlace also pins `VOYAGE_TICKETS_ORG`
and `VOYAGE_TICKETS_AUTH_ID` to an active permitted staff identity. The source
rechecks organization and permissions on every request. No browser cookie or
secret is forwarded to the other service. Preserve tenant boundaries and signed
member audit attribution in the original status updates. An ambiguous source
save requires rereading the original revision before another attempt.

This source covers premier_staff_issue, not separate parent beta feedback.
No Instinct account or third-party agent credentials are provisioned here.
