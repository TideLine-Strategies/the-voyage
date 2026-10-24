# Working together on The Voyage

`TideLine-Strategies/the-voyage` is the shared source of truth. Production is the
TideLine Cloudflare Worker at https://voyage.tidelinestrats.com/ and its D1
database. The `c-knudsen.workers.dev` Worker belongs to Cody's separate
Cloudflare account and is a sandbox; changes there do not change production.
Keep sandbox data separate from the TideLine CRM.

## Each change

1. Pull the latest `main` from the shared repository. On this Mac, make changes
   in a registered isolated worktree following `CLAUDE.md` and the workspace protocol.
2. Run `npm ci`, `npm run check`, and the checks appropriate to the changed UI.
3. Quan and Cody may push tested changes directly to `main` without the other
   person's review. Pull requests and reviews are optional collaboration tools.
   Managed agents publish through the coordinator, which checks current upstream
   and serializes the short main publication step.
4. CI still runs on `main` after a push. A main update starts the existing
   production build. Verify the active deployment and the actual changed behavior
   before calling a release live. Force pushes and main deletion remain disabled.

This direct-main policy was explicitly authorized by Quan on October 24, 2026.
It replaces the previous mutual-review and required-pre-push-check policy. It does
not remove human approval of social content, authentication or account permissions.

Do not commit a personal Cloudflare account's database ID, Worker route, token,
or production data to this repository. In particular, keep `wrangler.jsonc`
pointed at the TideLine production account. Do not deploy a PR branch to that
production Worker from a personal computer.

SQL migrations are reviewed and applied separately from the automatic Worker
deployment. Coordinate the order of a migration and dependent code so either
version of the Worker can run during the change. Keep customer exports and
one-time invitation links out of Git.

Quan and Cody are editors. Mary and Jack are approved guests with edit access to
existing CRM entries, no CRM creation or deletion, and a separate guest chat.
Additional members or broader visibility require an explicit access decision.
