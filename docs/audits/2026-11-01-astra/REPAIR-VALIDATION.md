# Repair validation

Application repairs are in `3c570ab9dc32fee3f7ae90642c90b0e7d177717a`; subsequent commits refine audit/verification tools. Task `1609fce96919` uses its registered isolated worktree. No production data was changed by the probes. Heavy checks used resource-run; resource holds were honored.

| Check | Result |
|---|---|
| Root `npm run check` | 242 tests passed, 0 failed; actual workerd authentication and two-task/two-subscriber collaboration accepted |
| Factory typecheck | Passed |
| Factory Vitest | 2 tests passed, including rejected-selection preservation |
| Factory build after Vite 8.3.5 | Passed; tracked generated bundle rebuilt; live verifier accepted |
| Isolated repair browser check | Passed: failed note text and dirty state retained; declined navigation stays in Notes; desktop/mobile deal controls editable; six-column deal table unaffected by profile styles; zero external requests |
| Current remaining-defect runtime probe | Passed against exact verificationToolHead; confirms remaining stale overwrites, truncation and recurrence defects as well as corrected validation |
| Historical workspace UI after updated assertions | Passed at 4 viewports: three panes, groups/table, selection, unsaved guard, saved and note readback; zero model calls |
| Whole-tree source checker | No syntax failures or parser warnings; see current-source-check.json for per-file methods and exclusions |
| Historical audit integrity validator | Passed: 343 original file hashes, 20 original findings and baseline evidence retained |
| Factory dependency audit after compatible update | 19 affected packages: 14 moderate, 5 high; no force/major migration performed |

The generic CRM stale-write failure remains despite the dedicated ticket-collaboration test accepting staleSaveRejected. The contracts are separate. Current remaining-defect probes, when accepted, demonstrate known remaining failures rather than overall application health.

The first updated historical workspace UI run exposed stale layout assumptions and an ambiguous note locator; these checks were corrected against current source. Do not report earlier failed runs as accepted. Final outcome is recorded separately in verification-results.json.

Evidence screenshots use synthetic data. failed-note-preserved.png deliberately displays the injected failed save. mobile-line-editor.png and repair-ui.png cover deal editing and table layout; these are local acceptance evidence, not production screenshots.

No authenticated production owner acceptance, social publication, email delivery, charge or provider reconnection was performed for the audit. Web source release and installed local Ticket Operations helper are separate gates. Keep the audit/remaining-repairs ticket open until unresolved work and its required acceptance are complete.

Safe reproduction from a registered worktree after locked dependency installation:

```sh
resource-run --owner YOUR_TASK_ID -- npm run check
resource-run --owner YOUR_TASK_ID -- npm run typecheck --prefix prototypes/content-factory
resource-run --owner YOUR_TASK_ID -- npm test --prefix prototypes/content-factory
resource-run --owner YOUR_TASK_ID -- npm run build:live --prefix prototypes/content-factory
resource-run --owner YOUR_TASK_ID -- node scripts/verify-audit-ui.mjs
resource-run --owner YOUR_TASK_ID -- node scripts/audit-remaining-runtime.mjs
node scripts/audit-source-check.mjs
node scripts/verify-audit-report.mjs
```

The full historical Factory browser suite requires its documented private source/media/research fixtures and was not run here. Do not manufacture those fixtures using live publishing or account changes. Automated coverage is not certified exhaustive manual semantic review; COVERAGE.md records that limit explicitly.
