# Working together on The Voyage

`TideLine-Strategies/the-voyage` is the shared source of truth. Production is the
TideLine Cloudflare Worker at https://voyage.tidelinestrats.com/ and its D1
database. The `c-knudsen.workers.dev` Worker belongs to Cody's separate
Cloudflare account and is a sandbox; changes there do not change production.
Keep sandbox data separate from the TideLine CRM.

## Each change

1. Pull the latest `main` from the shared repository. Create a short-lived
   topic branch, such as `cody/company-bio` or `quan/meeting-notes`. There is
   no permanent branch for either person.
2. Make the change in an isolated worktree. Run `npm ci` and `npm run check`.
   For work on this shared Mac, follow the registered `agent-workspace`
   protocol in `CLAUDE.md`.
3. Push the topic branch to the shared repository and open a pull request to
   `main`. Describe the user-visible change, test results, data or access
   impact, and any SQL migration. The other person reviews it.
4. Merge only after the required GitHub check and one review pass. A merge to
   `main` starts Cloudflare Workers Builds for the TideLine production Worker.
   Verify the build and active deployment before announcing the change as live.

Do not commit a personal Cloudflare account's database ID, Worker route, token,
or production data to this repository. In particular, keep `wrangler.jsonc`
pointed at the TideLine production account. Do not deploy a PR branch to that
production Worker from a personal computer.

SQL migrations are reviewed and applied separately from the automatic Worker
deployment. Coordinate the order of a migration and dependent code so either
version of the Worker can run during the change. Keep customer exports and
one-time invitation links out of Git.

Current production access is limited to Quan and Cody. A PR that adds members,
guests, or new visibility into CRM records needs an explicit access decision
before merging or applying its migration.
