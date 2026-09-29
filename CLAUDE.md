# The Voyage repository

The production site is a Cloudflare Worker with static assets in `public/`, API code in `src/worker.js`, and D1 SQL migrations in `migrations/`. GitHub Pages in `pages/` redirects to the live site. Read `README.md` for operations and migration notes.

Keep private exports, invitation links, and SQL containing customer data out of Git. Run `npm run check` for code validation. Use the registered isolated worktree protocol before repository writes and the audited submit workflow for integration.
