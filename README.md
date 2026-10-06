# The Voyage

The production TideLine CRM is hosted at https://voyage.tidelinestrats.com/ on a Cloudflare Worker and D1 SQL database. The former GitHub Pages address is not the deployment target. The original Claude artifact was imported on 2026-09-29: 92 accounts, 18 history entries, and two team chat messages. The artifact showed no saved meeting notes or tasks.

## Development and deployment

Quan and Cody work in short-lived branches and review each other's pull requests. See [CONTRIBUTING.md](CONTRIBUTING.md). Cloudflare Workers Builds deploys `main` from `TideLine-Strategies/the-voyage` after `npm run check`; preview builds are disabled. Confirm the Cloudflare build and Worker receipt after a merge.

Run `npm ci` and `npm run check` locally. SQL migrations are separate from code deployment. Apply a reviewed migration to TideLine D1 **before** merging code that depends on it: `npm run migrate:remote` uses the `tideline` Wrangler profile and the D1 binding in `wrangler.jsonc`. Do not commit exports, CRM data, invitation links, or guest personal addresses.

## Team access

The D1 `members` table is the private roster. Active membership is checked on every request, including requests with an existing session. `edit` members can create, edit, and delete CRM entries. `guest` members can browse the full CRM, edit existing accounts, tasks, appointments, and notes, move stages, complete tasks, and use Muninn. Guests cannot create or delete CRM entries or add or remove account locations. Guests have their own team chat, separate from Quan and Cody's chat; presence and Muninn chat context follow that separation. A guest may delete only their own chat messages. Deactivating a member in D1 revokes access on the next request.

Create a private roster JSON array outside Git, with objects containing `id`, `name`, `email`, and `role`. Run `node scripts/make-invites.mjs https://voyage.tidelinestrats.com <private-roster.json> <private-invites.sql> <private-links.json> [member-email]`. The script writes one-time links and roster/invitation SQL to private files with restricted permissions; it refuses to overwrite existing files. After reviewing the SQL, apply it with `wrangler d1 execute the-voyage --remote --profile tideline --file <private-invites.sql>`. Send each link privately. Invitations last 30 days; signed-in sessions last 180 days unless the member is deactivated.

## Muninn with local Codex

Muninn uses each member's signed-in Codex CLI through a local bridge; no OpenAI API key is configured on the Worker. Install Node.js and Codex CLI, run `codex login`, and start `node bridge/muninn-bridge.mjs` while using The Voyage. On macOS, `sh bridge/install-macos.sh` installs the bridge as a per-user LaunchAgent. The bridge listens on `127.0.0.1:38917`, runs Codex read-only, and accepts requests from the Voyage site origins. The Worker supplies current CRM context from D1, and each member's Muninn history is saved separately in D1. Muninn cannot edit CRM records or send messages.

## Admin page

Editors see an **Admin** page with Overview, Usage, Security, Data health, and System tabs. Guests cannot open it, and the Worker refuses `/api/admin` and `GET /api/usage` for them.

- Usage records page views and action labels per member (never record contents or typed text), with device type and the coarse city/region/country Cloudflare reports. Rows older than 180 days are deleted when an editor loads usage. Apply `migrations/0004_usage_events.sql` before or after deploying; until it exists, usage writes are ignored and the Usage tab says it is off.
- Security lists members, signed-in devices, and invitation status, and lets an editor sign a member out of every device. Token hashes are never returned.
- Data health and System are computed from existing records.

## Search, import/export, calendar, and audit log

- **Search everything** (left menu, or press `/`) covers accounts, tasks and appointments, meeting notes, vendors (editors), team chat, and people, using records already loaded in the browser.
- **Lead source** is a field on each account, filterable on Accounts and summarized under Admin › Data health.
- **Import** (Accounts page, editors) reads a CSV with an Organization or Name column; duplicates by name are skipped. **Export** (Admin › System) downloads CSVs; cells that look like formulas are prefixed so spreadsheets treat them as text.
- **Calendar**: appointments can be downloaded as `.ics`, and each member can create a private subscription link under Profile (`/cal/<secret>.ics`; only a hash is stored; making a new link revokes the old one).
- **Audit log** (Admin › Audit log) is written by the Worker on every create, update, and delete, plus sign-ins and sign-outs. Labels come from record names; chat text is never stored. Kept 365 days.
- `migrations/0005_audit_calendar.sql` creates the audit and calendar tables. Until it is applied, changes still work, nothing is audited, and calendar links report that setup is needed.
- **Daily brief** on Home asks Muninn for today's priorities.

## Calendar

The **Calendar** page shows appointments, tasks, and account next steps in month, week, and agenda views (keyboard: ←/→, T, M, W, A). Drag an item to another day to reschedule it; click an empty day or time slot to book a meeting (editors). Timed meetings that overlap another busy item are marked ⚠.

Each member can connect one outside calendar (Google, Outlook, or Apple) by pasting its private iCal address. The Worker fetches it server-side (`src/ical.js` parses time zones, all-day, repeating events, exceptions, and cancellations), shows the events only to that member, and never returns the address to the browser. Only https/webcal addresses on Google, Microsoft, and iCloud calendar hosts are accepted. The `external_calendars` table is in `migrations/0005_audit_calendar.sql`.
