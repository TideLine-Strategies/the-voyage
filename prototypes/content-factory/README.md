# TideLine Content Factory

The completed app uses actual LinkedIn sources and authenticated Voyage editorial storage. Demo data, generated imagery, simulated publishing and the browser-only store have been removed. The original Lovable source is preserved separately in the recovery archive.

From the repository root:

```sh
npm ci
npx --yes npm@11 ci --prefix prototypes/content-factory --ignore-scripts
npm run typecheck --prefix prototypes/content-factory
npm run build:live --prefix prototypes/content-factory
```

The generated app is served by Voyage at `/factory/`. No new service, paid AI or database is required. For loopback-only acceptance, provide the private source baseline through `CONTENT_BASELINE_FILE` and run `node scripts/preview-live-factory.mjs`, then open `http://127.0.0.1:17901/__local-review`. This uses an ephemeral local database and synthetic local membership. Production access uses the existing approved Voyage account.

The app contains no prewritten AI posts. Ten linked research sources, eight research briefs and three blank operational worksheets support gym-owner and admin education, real WonPlace demonstrations and future product campaigns. Working briefs require team-authored copy and real evidence before human review.

See [the live integration and release guide](../../docs/content-factory-live.md) for the persistence, approval, source import, CRM and publishing boundaries. Original build notes and reference are in `docs/`; they describe the historical prototype, not the current production state.
