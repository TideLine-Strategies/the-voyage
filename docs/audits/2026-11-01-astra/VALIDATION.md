# Validation record

Source baseline: `eda8dfb094dddba0664de4ad6d376f5b27664edb`. Tests performed in task `466de0cefb56`'s registered worktree with synthetic fixtures. Heavy jobs used resource-run; memory pressure initially held admission and one earlier probe admission timed out. A subsequent admitted run succeeded. No resource hold was bypassed.

| Check | Actual result |
|---|---|
| Root `npm ci --ignore-scripts --no-audit --no-fund` | Passed |
| Root `npm run check` | 230 tests passed, 0 failed; actual-workerd auth and independent two-task collaboration probes accepted |
| `node docs/audits/2026-11-01-astra/client-probes.mjs` | Passed defect demonstrations; see client-results.jsonl |
| `resource-run --owner 466de0cefb56 -- node scripts/audit-crm-reproductions.mjs` | Passed nine local Worker/calendar defect demonstrations; see worker-results.json |
| Factory dependency install | Passed, 555 packages installed |
| Factory `npm run typecheck` | Passed |
| Factory `npm test` | 1 test file / 1 test passed |
| Factory `npm run build:live` and tracked artifact comparison | See build addendum below |
| Root `npm audit --omit=dev --json` | 0 affected packages reported |
| Factory `npm audit --package-lock-only --json` | 20 affected packages: 14 moderate, 6 high, 0 critical; full artifact retained |
| Report artifact validator | `node scripts/verify-audit-report.mjs`; validates hashes against the pinned Git baseline, finding references and evidence artifacts |

The root runtime collaboration test's `staleSaveRejected` result concerns the dedicated collaboration contract; it does not exercise or disprove the generic CRM stale-write bug in CRM-02.

No authenticated production acceptance, external-provider reconnection, payment, email delivery, capture or social publication was performed as part of this audit. Existing live UI evidence for earlier mascot fixes is not reused as proof that these audit findings are repaired. Factory browser interaction checks were not run by this audit. A successful typecheck/build is not UI or production acceptance.

## Reproduce safely

From the repository root, after installing locked root dependencies:

```sh
node docs/audits/2026-11-01-astra/client-probes.mjs
resource-run --owner YOUR_MANAGED_TASK_ID -- node scripts/audit-crm-reproductions.mjs
node scripts/verify-audit-report.mjs
```

The first two scripts intentionally assert faulty baseline behavior. They must fail or be rewritten as corrected regression tests when the corresponding bug is fixed. They never need production secrets. Do not run deployment, installation or publisher scripts merely to validate this report.

## Build addendum

Factory `npm run build:live --prefix prototypes/content-factory` passed. The live bundle verifier passed, and `git diff --exit-code -- public/factory` confirmed no tracked artifact drift. Vite emitted existing warnings about the non-module host script and runtime-resolved host CSS/logo; these did not fail the build. No generated factory changes are included in this report commit.
