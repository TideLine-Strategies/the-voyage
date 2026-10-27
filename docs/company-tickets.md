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

## Kanban stages

The default Tickets view is a six-lane board: Backlog → Open → In progress →
Blocked → In review → Resolved. Each lane displays its actual filtered count.
Drag a card to a lane or use its Move to selector (keyboard/touch friendly).
Moves use the existing expected-revision API and only repaint after a confirmed
save. Failed/conflicting moves keep the previous card placement and offer refresh.
Open a card for its existing editor, screenshots and notes; Back to board/list
returns to the full-width workflow. A List toggle preserves the previous view.
Search, product selection, trash and status filtering still apply.

Untriaged WonPlace original reports appear in their original Open/In progress/
Resolved lanes with an Original report label. Their moves write through to
WonPlace with its revision checks. Other stages require explicit Company triage;
no inferred stage or duplicate triage ticket is created by dragging. Linked
originals are represented by their Company ticket, so counts do not double.

## Spring requests, coding actions and daily priorities

Spring bug reports already use the original WonPlace source. Explicit feature
requests now share that path, retain their images, and carry feature type into
Company triage. The source remains permission-filtered and tenant-bound.

Saved tickets and original reports offer Fix with Codex, Fix with Claude and
Copy prompt. A preview opens first. Launch fetches current evidence, verifies a
short-lived signed package, downloads saved screenshots, and starts the selected
installed CLI through the managed workspace launcher. The helper shows the
actual durable task state. Queued/running is not resolved. Copy prompt remains
available when a computer has no local helper. WonPlace and Voyage repositories
are configured; other product repositories must be deliberately added before
local launch is supported.

Muninn's owner-Mac job reviews all product scopes at 09:00 America/Chicago,
catching up after wake. It uses the existing read-only Muninn connector for
priority decisions, appends deterministic source counts, then emails Quan and
Cody from the TideLine Mail account. Send intent and exact Sent confirmation
prevent duplicates; uncertain sends require reconciliation. Native Mail, Muninn,
the owner Mac and source access must be available. See the living policy in
`docs/agents/company-ticket-operations.md`. First-party collector configuration
is reused privately; no new credentials or paid service are introduced.

The coding queue works across browsers and devices: the CRM stores an
authenticated launch request, and the owner Mac worker claims it with its signed
source connection. Browser security settings do not need changing. Only Quan
and Cody can enqueue/cancel coding workers; ordinary editors can copy prompts.
Each ticket shows recent coding task states. A queued request can be cancelled
before claim; uncertain launches remain explicit and are never auto-replayed.
The daily review includes coding-job state alongside ticket evidence.

Fix with Claude uses **your own computer and Claude Code account**. Download the task ZIP, extract it, select the matching repository in Claude Desktop’s Code tab with Worktree enabled, then paste TASK.md and attach screenshots/. Terminal users can use the README’s `claude --worktree --add-dir` instructions. No owner-Mac login is required. Downloading starts no repair and marks no ticket resolved; add the eventual PR and checks back to Company. Fix with Codex continues to queue the shared owner Mac worker.
