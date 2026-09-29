# The Voyage

The live TideLine CRM is hosted at https://the-voyage.q-stewart.workers.dev/. It uses a Cloudflare Worker and D1 SQL database. Only people listed in `src/members.js` can activate individual invitation links. A signed-in session lasts 180 days. The GitHub Pages address redirects to the live site.

The original Claude artifact is https://claude.ai/artifact/3EebdbpJ2S6TF3uJi8tV5B. The 2026-09-29 migration imported 92 accounts, 18 history entries, and two team chat messages. The artifact showed no saved meeting notes or tasks. The import uses the original account IDs shown in the artifact UI. Account status timestamps were reconstructed from the displayed day counts, and hidden research-needs fields were not exposed by its UI.

## Run and deploy

Install dependencies with `npm ci` and validate with `npm run check`. Apply SQL migrations with `npm run migrate:remote`, then deploy with `npm run deploy`. The `tideline` Wrangler profile must have access to the TideLine Cloudflare account. The D1 ID is in `wrangler.jsonc`.

`scripts/import-artifact.mjs` converts a private UI export to SQL. `scripts/make-invites.mjs` creates one-time invitation links and their SHA-256 hashes. Keep exports, import SQL, and invitation links outside this repository. Only hashes are stored in D1.

Muninn calls OpenAI's `gpt-5.3-codex` model through the authenticated Worker. The Worker reads current CRM records from D1, sends a bounded snapshot with each question, requests `store: false`, and saves each member's conversation in D1. It cannot edit records or send messages. Set the `OPENAI_API_KEY` Worker secret on the `tideline` profile to enable answers; without it, the chat returns a clear 503 error. OpenAI API usage is billed separately from a Codex or ChatGPT subscription. View-only members can use Muninn too.

## Team access

`src/members.js` is the one list of people who can sign in. Each person has a permanent two-letter `id`, a `name`, an `email`, and a `role`:

- `edit`: full access. Can create and change opps, tasks, appointments, notes, locations, and team chat, and can own records.
- `view`: read-only. Can browse every page and ask Muninn. Cannot change records, post or react in team chat, or own records. The Worker refuses their writes with `403 View-only access`, and the app hides the editing controls.

To add someone, add them to `src/members.js`, run `npm run check`, then `npm run migrate:remote` (the first time only, for `0003_open_member_ids.sql`) and `npm run deploy`. Then create their invitation with `node scripts/make-invites.mjs https://the-voyage.q-stewart.workers.dev <private-invites.sql> <private-links.json> <their-email>`, apply that SQL with `wrangler d1 execute the-voyage --remote --profile tideline --file <private-invites.sql>`, and send them the link privately. To change a role or remove someone, edit the list and deploy; it takes effect on their next request.
