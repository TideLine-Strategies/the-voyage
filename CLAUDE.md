# The Voyage repository

The production site is a Cloudflare Worker with static assets in `public/`, API code in `src/worker.js`, and D1 SQL migrations in `migrations/`. GitHub Pages in `pages/` redirects to the live site. Read `README.md` for operations and migration notes.

Keep private exports, invitation links, and SQL containing customer data out of Git. Run `npm run check` for code validation. Use the registered isolated worktree protocol before repository writes and the audited submit workflow for integration.

Use `TideLine-Strategies/the-voyage` as the canonical repository and read `CONTRIBUTING.md` before changes. Work on a short-lived branch and open a pull request to `main`. Do not replace the TideLine D1 ID or custom domain in `wrangler.jsonc` with values from a personal Cloudflare account. Production CRM access remains limited to Quan and Cody unless Quan explicitly approves a different access policy.
