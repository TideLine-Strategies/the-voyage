# The Voyage

The live TideLine CRM is hosted at https://the-voyage.q-stewart.workers.dev/. It uses a Cloudflare Worker and D1 SQL database. Only Quan and Cody can activate individual invitation links. A signed-in session lasts 180 days. The GitHub Pages address redirects to the live site.

The original Claude artifact is https://claude.ai/artifact/3EebdbpJ2S6TF3uJi8tV5B. The 2026-09-29 migration imported 92 accounts, 18 history entries, and two team chat messages. The artifact showed no saved meeting notes or tasks. The import uses the original account IDs shown in the artifact UI. Account status timestamps were reconstructed from the displayed day counts, and hidden research-needs fields were not exposed by its UI.

## Run and deploy

Install dependencies with `npm ci` and validate with `npm run check`. Apply SQL migrations with `npm run migrate:remote`, then deploy with `npm run deploy`. The `tideline` Wrangler profile must have access to the TideLine Cloudflare account. The D1 ID is in `wrangler.jsonc`.

`scripts/import-artifact.mjs` converts a private UI export to SQL. `scripts/make-invites.mjs` creates one-time invitation links and their SHA-256 hashes. Keep exports, import SQL, and invitation links outside this repository. Only hashes are stored in D1.

Muninn calls OpenAI's `gpt-5.3-codex` model through the authenticated Worker. The Worker reads current CRM records from D1, sends a bounded snapshot with each question, requests `store: false`, and saves each member's conversation in D1. It cannot edit records or send messages. Set the `OPENAI_API_KEY` Worker secret on the `tideline` profile to enable answers; without it, the chat returns a clear 503 error. OpenAI API usage is billed separately from a Codex or ChatGPT subscription. The two member identities are enforced in the Worker and the invite database.
