# The Voyage

The live TideLine CRM is hosted at https://the-voyage.q-stewart.workers.dev/. It uses a Cloudflare Worker and D1 SQL database. Only Quan and Cody can activate individual invitation links. A signed-in session lasts 180 days. The GitHub Pages address redirects to the live site.

The original Claude artifact is https://claude.ai/artifact/3EebdbpJ2S6TF3uJi8tV5B. The 2026-09-29 migration imported 92 accounts, 18 history entries, and two team chat messages. The artifact showed no saved meeting notes or tasks. The import uses the original account IDs shown in the artifact UI. Account status timestamps were reconstructed from the displayed day counts, and hidden research-needs fields were not exposed by its UI.

## Run and deploy

Install dependencies with `npm ci` and validate with `npm run check`. Apply SQL migrations with `npm run migrate:remote`, then deploy with `npm run deploy`. The `tideline` Wrangler profile must have access to the TideLine Cloudflare account. The D1 ID is in `wrangler.jsonc`.

`scripts/import-artifact.mjs` converts a private UI export to SQL. `scripts/make-invites.mjs` creates one-time invitation links and their SHA-256 hashes. Keep exports, import SQL, and invitation links outside this repository. Only hashes are stored in D1.

## Muninn with local Codex

Muninn uses the signed-in Codex CLI on **each member's own computer**. Install the current Node.js and Codex CLI, run `codex login`, then run `node bridge/muninn-bridge.mjs` while using The Voyage. On macOS, `sh bridge/install-macos.sh` installs the bridge as a per-user LaunchAgent. Quan's Codex account is never exposed to Cody. Cody needs his own Codex sign-in and local connector.

The bridge listens only on `127.0.0.1:38917` and accepts requests from the two Voyage site origins. It runs `codex exec` with user configuration, plugins, shell, and web search disabled, a read-only sandbox, and ephemeral sessions. It does not expose Codex credentials or commands to the site. The authenticated Worker supplies current CRM records from D1; the browser sends them to the local Codex bridge and saves the answer and chat history in D1. Codex usage counts against the signed-in member's plan. Muninn cannot edit CRM records, run commands, or send messages. The bridge must be running on the computer being used; the site itself remains available when it is offline.
