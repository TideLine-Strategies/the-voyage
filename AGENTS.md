# Collaborative CRM ticket workspace

Use task tools rather than shared browser clicks to read or alter tickets. Each managed task has its own focus, draft and caret. Never send OS mouse/keyboard events to simulate another cursor or navigate the owner's CRM.

Installed command:
`node "$HOME/Library/Application Support/TideLine/Ticket Operations/scripts/ticket-workspace.mjs" COMMAND --task TASK_ID`

- `read`: current linked ticket, its revision, other task workspaces.
- `list [--offset N]`: read product tickets (100 per page).
- `focus [--field description] [--status reading|working|testing|waiting]`: report actual task focus. Refresh while actively working; presence expires after 60 seconds.
- `type --field description --file /absolute/draft.txt [--caret N]`: stage your actual draft and caret. It is visible beside the owner's form, never inside their input. Do not publish credentials or private logs.
- `save --file /absolute/change.json`: save `{ "expectedRevision": CURRENT_REVISION, "patch": { "description": "..." } }`. Only the task's linked ticket can be changed. A 409 means read the latest revision, reconcile changes, and retain your draft. Never blindly retry a stale save.
- `leave`: remove your cursor.

Task identity, product, owner and label are derived from the authenticated managed task link. Drafts and cursor locations are ephemeral; saved changes keep the ticket's attributed history. Only the human can sign human acceptance. Coordinator progress alone is shown as progress, not keystrokes. Existing source reports stay intact.

Recent blocked tasks remain visible for up to 24 hours after the reported blocker, even after their worker heartbeat stops. Clicking a blocked task sends a status message and recovery steps to the existing right-hand agent panel. Treat these as reported coordinator facts, not a model conversation or permission to bypass a release gate. Plain task titles omit ticket codes; technical task references remain in expanded details. Active animation requires recent task-tool activity; a heartbeat alone is idle. Respect reduced-motion preferences.
