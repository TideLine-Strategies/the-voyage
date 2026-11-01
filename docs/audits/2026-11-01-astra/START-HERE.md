# Astra: start here

Read [REPORT.md](REPORT.md), then [VALIDATION.md](VALIDATION.md). The report is the executable repair plan; [findings.json](findings.json) contains the same 20 structured findings. [inventory.json](inventory.json) pins every baseline tracked file by SHA-256.

Requested outcome: repair Voyage CRM reliability and complete the remaining semantic review. Start with CRM-01 through the ordered batches, verifying current main before each change. The audit has full mechanical byte coverage, not certified manual semantic review of every line. Keep that distinction in all progress/completion reports.

Use the managed isolated-worktree/coordinator contract. Keep separate scoped commits and meaningful regression tests. Retain customer data, financial safeguards, real human approval, persistent agent composer and human selection. Do not launch external publishing, payment or installation flows to run audit probes.

Existing defect probes intentionally demonstrate the broken baseline. Convert them to corrected regression tests as repairs land. Follow the exact acceptance checks and attach the merged/deployed/live-verified evidence separately. Do not resolve a product ticket because a local test passed.
