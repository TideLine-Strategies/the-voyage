# The Voyage

The live TideLine CRM is hosted at https://voyage.tidelinestrats.com/ (also https://the-voyage.q-stewart.workers.dev/). It uses a Cloudflare Worker and D1 SQL database. Only Quan and Cody can activate individual invitation links. A signed-in session lasts 180 days. Use the Cloudflare address; the former GitHub Pages address is not the deployment target.

The original Claude artifact is https://claude.ai/artifact/3EebdbpJ2S6TF3uJi8tV5B. The 2026-09-29 migration imported 92 accounts, 18 history entries, and two team chat messages. The artifact showed no saved meeting notes or tasks. The import uses the original account IDs shown in the artifact UI. Account status timestamps were reconstructed from the displayed day counts, and hidden research-needs fields were not exposed by its UI.

## Run and deploy

Quan and Cody use short-lived branches, pull requests, a passing check, and
review before merging. See [CONTRIBUTING.md](CONTRIBUTING.md) for the shared
workflow and the distinction between production and Cody's sandbox Worker.

Cloudflare Workers Builds connects `TideLine-Strategies/the-voyage` to the existing `the-voyage` Worker. A push to `main` runs `npm run check` and then `npx wrangler deploy`. Preview builds are disabled. Submit changes through a pull request and merge reviewed changes to `main` to deploy them. Check the Cloudflare build and Worker deployment receipts before treating a release as live.

Install dependencies with `npm ci` and validate locally with `npm run check`. SQL migrations are separate from the automatic code deployment: an operator with access to the TideLine Cloudflare account runs `npm run migrate:remote` after reviewing the migration and its data impact. The `tideline` Wrangler profile is used for that command. The D1 ID is in `wrangler.jsonc`.

`scripts/import-artifact.mjs` converts a private UI export to SQL. `scripts/make-invites.mjs` creates one-time invitation links and their SHA-256 hashes. Keep exports, import SQL, and invitation links outside this repository. Only hashes are stored in D1.

The Claude-only Muninn assistant is not connected in this hosted version; the CRM, notes, activity, and team chat use D1. The two member identities are enforced in the Worker and the invite database.

## Summarize meeting notes with your own agent

The Worker has no AI service and holds no API key. Instead each person runs the agent they are already signed in to on their own computer: Claude Code for Cody, Codex for Quan. Plan logins are only used through those tools, never by the site.

1. Sign in once: run `claude` (Claude Code) or `codex login` (Codex).
2. In a note, add the notes or upload a transcript, then click **Copy prompt**.
3. Run `node scripts/voyage-summarize.mjs`. It picks Claude Code first, then Codex; force one with `--agent claude` or `--agent codex` (or set `VOYAGE_AGENT`).
4. Back in the note, click **Paste summary**, review it, add any action items as tasks, and save the note.

The script only accepts a prompt copied from the app, runs the agent with tools off in an empty temporary folder, and puts the summary JSON back on the clipboard. It needs Node 18 or newer and no dependencies.
## Muninn with local Codex

Muninn uses the signed-in Codex CLI on **each member's own computer**. Install the current Node.js and Codex CLI, run `codex login`, then run `node bridge/muninn-bridge.mjs` while using The Voyage. On macOS, `sh bridge/install-macos.sh` installs the bridge as a per-user LaunchAgent. Quan's Codex account is never exposed to Cody. Cody needs his own Codex sign-in and local connector.

The bridge listens only on `127.0.0.1:38917` and accepts requests from the two Voyage site origins. It runs `codex exec` with user configuration, plugins, shell, and web search disabled, a read-only sandbox, and ephemeral sessions. It does not expose Codex credentials or commands to the site. The authenticated Worker supplies current CRM records from D1; the browser sends them to the local Codex bridge and saves the answer and chat history in D1. Codex usage counts against the signed-in member's plan. Muninn cannot edit CRM records, run commands, or send messages. The bridge must be running on the computer being used; the site itself remains available when it is offline.
